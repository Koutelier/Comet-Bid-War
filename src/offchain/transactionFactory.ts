import { EIP12UnsignedTransaction } from "@fleet-sdk/common";
import { Amount, Box, ErgoAddress, OutputBuilder, TransactionBuilder } from "@fleet-sdk/core";
import { parse } from "@fleet-sdk/serializer";
import {
  CancelOrderPlugin,
  CloseOrderPlugin,
  LiquidatePlugin,
  OpenOrderParams,
  OpenOrderPlugin,
  RepayPlugin,
  AuctionGenesisPlugin,
  AuctionBidPlugin,
  AuctionManualClaimPlugin,
  AuctionAutoDistributePlugin,
  AuctionOwnerClaimPlugin,
  BidType
} from "./plugins";
import { MIN_FEE } from "@/constants";
import { useChainStore, useWalletStore } from "@/stories";
import { cleanBoxForTransaction } from "@/utils/otherUtils";

export const OPEN_ORDER_UI_FEE = 10000000n;
const IMPLEMENTOR_ADDRESS = ErgoAddress.fromBase58(
  "9i3g6d958MpZAqWn9hrTHcqbBiY5VPYBBY6vRDszZn4koqnahin"
);

export class TransactionFactory {
  public static async openOrder(order: Omit<OpenOrderParams, "borrower">) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();
    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(OpenOrderPlugin({ ...order, borrower: changeAddress }))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async cancelOrder(box: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();
    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(CancelOrderPlugin(box, changeAddress))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async closeOrder(orderBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(
        CloseOrderPlugin(orderBox, {
          currentHeight: chain.height,
          lender: changeAddress,
          uiImplementor: IMPLEMENTOR_ADDRESS
        })
      )
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async liquidate(box: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(LiquidatePlugin(box, changeAddress))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async repay(box: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(RepayPlugin(box))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  private static async _getTxContext() {
    const chain = useChainStore();
    const wallet = useWalletStore();

    const inputs = await wallet.getBoxes();
    const changeAddress = ErgoAddress.fromBase58(await wallet.getChangeAddress());

    return { inputs, changeAddress, chain, wallet };
  }

  private static async _signAndSend(
    unsignedTx: EIP12UnsignedTransaction,
    wallet: ReturnType<typeof useWalletStore>
  ) {
    const signedTx = await wallet.signTx(unsignedTx);

    return await wallet.submitTx(signedTx);
  }

  // ========================================
  // AUCTION TRANSACTIONS
  // ========================================

  public static async startAuction() {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionGenesisPlugin(chain.height))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async placeBid(auctionBox: Box<Amount>, bidType: BidType, bidAmount?: bigint) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    // Clean box to make it serializable for wallet
    const cleanBox = cleanBoxForTransaction(auctionBox) as unknown as Box<Amount>;

    // V3: Calculate 10% minimum bid increment
    const totalCometAmount = BigInt(cleanBox.assets[0]?.amount || 0);
    const totalErgAmount = BigInt(cleanBox.value);
    const winnableCometAmount = totalCometAmount - 1n; // Minus base
    const winnableErgAmount = totalErgAmount - 1000000n; // Minus base ERG

    // Calculate minimum increment (10% of winnable pot, or minimum entry fee, whichever is higher)
    const minCometIncrement = winnableCometAmount > 0n
      ? ((winnableCometAmount * 10n) / 100n > 100000n
        ? (winnableCometAmount * 10n) / 100n
        : 100000n)
      : 100000n;

    const minErgIncrement = winnableErgAmount > 0n
      ? ((winnableErgAmount * 10n) / 100n > 1000000000n
        ? (winnableErgAmount * 10n) / 100n
        : 1000000000n)
      : 1000000000n;

    // Use provided bidAmount or minimum increment
    const actualBidAmount = bidAmount || (bidType === "comet" ? minCometIncrement : minErgIncrement);

    // V3: Validate bid amount meets minimum
    if (bidType === "comet" && actualBidAmount < minCometIncrement) {
      throw new Error(`Minimum COMET bid: ${Number(minCometIncrement) / 1000000} COMET (10% of winnable pot)`);
    }
    if (bidType === "erg" && actualBidAmount < minErgIncrement) {
      throw new Error(`Minimum ERG bid: ${Number(minErgIncrement) / 1000000000} ERG (10% of winnable pot)`);
    }

    // V3: Check max bids
    const bidCount = BigInt(cleanBox.additionalRegisters?.R6 ? parse<bigint>(cleanBox.additionalRegisters.R6) : 0);
    if (bidCount >= 1000n) {
      throw new Error('Maximum bids (1000) reached for this round');
    }

    console.log("🔧 TransactionFactory.placeBid:");
    console.log("  chain.height:", chain.height);
    console.log("  cleanBox R6:", cleanBox.additionalRegisters?.R6);
    console.log("  cleanBox R7:", cleanBox.additionalRegisters?.R7);
    console.log("  parsed bidCount:", bidCount);

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(
        AuctionBidPlugin(cleanBox, {
          bidType,
          bidder: changeAddress
        }, chain.height, actualBidAmount)
      )
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async claimAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    // Clean box to make it serializable for wallet
    const cleanBox = cleanBoxForTransaction(auctionBox) as unknown as Box<Amount>;

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionManualClaimPlugin(cleanBox, changeAddress))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async autoDistributeAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    // Clean box to make it serializable for wallet
    const cleanBox = cleanBoxForTransaction(auctionBox) as unknown as Box<Amount>;

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionAutoDistributePlugin(cleanBox, chain.height))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async ownerClaimAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    // Clean box to make it serializable for wallet
    const cleanBox = cleanBoxForTransaction(auctionBox) as unknown as Box<Amount>;

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionOwnerClaimPlugin(cleanBox))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }
}
