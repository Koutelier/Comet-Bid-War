import { EIP12UnsignedTransaction } from "@fleet-sdk/common";
import { Amount, Box, ErgoAddress, OutputBuilder, TransactionBuilder } from "@fleet-sdk/core";
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

  public static async placeBid(auctionBox: Box<Amount>, bidType: BidType) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(
        AuctionBidPlugin(auctionBox, {
          bidType,
          bidder: changeAddress
        })
      )
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async claimAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionManualClaimPlugin(auctionBox, changeAddress))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async autoDistributeAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionAutoDistributePlugin(auctionBox, chain.height))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }

  public static async ownerClaimAuction(auctionBox: Box<Amount>) {
    const { chain, changeAddress, inputs, wallet } = await this._getTxContext();

    const unsignedTx = new TransactionBuilder(chain.height)
      .from(inputs)
      .extend(AuctionOwnerClaimPlugin(auctionBox))
      .payFee(MIN_FEE)
      .sendChangeTo(changeAddress)
      .build()
      .toEIP12Object();

    return await this._signAndSend(unsignedTx, wallet);
  }
}
