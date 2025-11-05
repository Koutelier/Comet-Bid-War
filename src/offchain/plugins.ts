import { Box, ensureBigInt, first, isDefined } from "@fleet-sdk/common";
import {
  Amount,
  ErgoAddress,
  ErgoUnsignedInput,
  FleetPlugin,
  OutputBuilder,
  SAFE_MIN_BOX_VALUE,
  TokenAmount,
  TokensCollection
} from "@fleet-sdk/core";
import { blake2b256, hex } from "@fleet-sdk/crypto";
import { parse, SByte, SColl, SGroupElement, SInt, SLong, SSigmaProp } from "@fleet-sdk/serializer";
import {
  ERG_TOKEN_ID,
  COMET_TOKEN_ID,
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE,
  BID_DURATION,
  BASE_COMET_AMOUNT,
  BASE_ERG_AMOUNT,
  DEV_FEE_PERCENT,
  OWNER_PK,
  BOT_PK,
  GRACE_PERIOD,
  MAX_BIDS_PER_ROUND,
  MIN_PAYMENT_THRESHOLD,
  MIN_BID_INCREMENT_PERCENT
} from "@/constants";
import { getNetworkType } from "@/utils";

export type OpenOrderType = "on-close" | "fixed-height";

export type OpenOrderParams = {
  type: OpenOrderType;
  borrower: ErgoAddress;
  loan: {
    amount: Amount;
    repayment: Amount;
    tokenId: string;
  };
  maturityLength: number;
  collateral: {
    nanoErgs?: Amount;
    tokens?: TokenAmount<Amount>[];
  } & ({ nanoErgs: Amount } | { tokens: TokenAmount<Amount>[] });
};

const STORAGE_PERIOD = 1_051_200;

export const ORDER_ON_CLOSE_ERG_CONTRACT =
  "1012040005e80705c09a0c08cd03a11d3028b9bc57b6ac724485e99960b89c278db6bab5d2b961b01aee29405a0205a0060601000e20eccbd70bb2ed259a3f6888c4b68bbd963ff61e2d71cdfda3c7234231e1e4b76604020400043c04100400040401010402040601010101d80bd601b2a5730000d602e4c6a70408d603e4c6a70704d604e4c6a70505d605e30008d606e67205d6077301d6087302d6097303d60a957206d801d60a7e72040683024406860272099d9c7e720706720a7e7208068602e472059d9c7e730406720a7e72080683014406860272099d9c7e7207067e7204067e720806d60b730595937306cbc27201d804d60c999aa37203e4c672010704d60db2a5730700d60eb2720a730800d60f8c720e02d1ed96830b0193e4c67201040ec5a793e4c672010508720293e4c672010605e4c6a70605e6c67201080893db63087201db6308a793c17201c1a7927203730990720c730a92720c730b93c2720dd0720293c1720d7204ed9591720f720bd801d610b2a5730c009683020193c27210d08c720e01937ec1721006720f730d957206d802d610b2720a730e00d6118c72100295917211720bd801d612b2a5730f009683020193c27212d08c721001937ec17212067211731073117202";
export const ORDER_FIXED_ERG_CONTRACT =
  "100f040005e80705c09a0c08cd03a11d3028b9bc57b6ac724485e99960b89c278db6bab5d2b961b01aee29405a0205a0060601000e20eccbd70bb2ed259a3f6888c4b68bbd963ff61e2d71cdfda3c7234231e1e4b76604020400040401010402040601010101d80ad601b2a5730000d602e4c6a70408d603e4c6a70505d604e30008d605e67204d6067301d6077302d6087303d609957205d801d6097e72030683024406860272089d9c7e72060672097e7207068602e472049d9c7e73040672097e72070683014406860272089d9c7e7206067e7203067e720706d60a730595937306cbc27201d803d60bb2a5730700d60cb27209730800d60d8c720c02d1ed9683090193e4c67201040ec5a793e4c672010508720293e4c672010605e4c6a70605e6c67201080893db63087201db6308a793c17201c1a793e4c672010704e4c6a7070493c2720bd0720293c1720b7203ed9591720d720ad801d60eb2a57309009683020193c2720ed08c720c01937ec1720e06720d730a957205d802d60eb27209730b00d60f8c720e029591720f720ad801d610b2a5730c009683020193c27210d08c720e01937ec1721006720f730d730e7202";

export const ORDER_ON_CLOSE_TOKEN_CONTRACT_TEMPLATE = [
  "101c04000e20", // tokenId
  "05e80705c09a0c08cd03a11d3028b9bc57b6ac724485e99960b89c278db6bab5d2b961b01aee29405a0205a0060601000e20", // bond contract hash
  "040204000400043c041004000580897a0402040404000580897a040201010402040604000580897a040201010101d80cd601b2a5730000d602e4c6a70408d603e4c6a70704d6047301d605e4c6a70505d606e30008d607e67206d6087302d6097303d60a7304d60b957207d801d60b7e720506830244068602720a9d9c7e720806720b7e7209068602e472069d9c7e730506720b7e720906830144068602720a9d9c7e7208067e7205067e720906d60c730695937307cbc27201d806d60d999aa37203e4c672010704d60eb2a5730800d60fdb6308720ed610b2720f730900d611b2720b730a00d6128c721102d1ed96830e0193e4c67201040ec5a793e4c672010508720293e4c672010605e4c6a70605e6c67201080893db63087201db6308a793c17201c1a7927203730b90720d730c92720d730d93c2720ed0720293c1720e730e938c7210017204938c721002720593b1720f730fed95917212720cd803d613b2a5731000d614db63087213d615b272147311009683050193c27213d08c72110193c172137312938c7215017204937e8c72150206721293b1721473137314957207d802d613b2720b731500d6148c72130295917214720cd803d615b2a5731600d616db63087215d617b272167317009683050193c27215d08c72130193c172157318938c7217017204937e8c72170206721493b172167319731a731b7202"
];

export const ORDER_FIXED_TOKEN_CONTRACT_TEMPLATE = [
  "101904000e20", // tokenId
  "05e80705c09a0c08cd03a11d3028b9bc57b6ac724485e99960b89c278db6bab5d2b961b01aee29405a0205a0060601000e20", // bond contract hash
  "0402040004000580897a0402040404000580897a040201010402040604000580897a040201010101d80bd601b2a5730000d602e4c6a70408d6037301d604e4c6a70505d605e30008d606e67205d6077302d6087303d6097304d60a957206d801d60a7e72040683024406860272099d9c7e720706720a7e7208068602e472059d9c7e730506720a7e72080683014406860272099d9c7e7207067e7204067e720806d60b730695937307cbc27201d805d60cb2a5730800d60ddb6308720cd60eb2720d730900d60fb2720a730a00d6108c720f02d1ed96830c0193e4c67201040ec5a793e4c672010508720293e4c672010605e4c6a70605e6c67201080893db63087201db6308a793c17201c1a793e4c672010704e4c6a7070493c2720cd0720293c1720c730b938c720e017203938c720e02720493b1720d730ced95917210720bd803d611b2a5730d00d612db63087211d613b27212730e009683050193c27211d08c720f0193c17211730f938c7213017203937e8c72130206721093b1721273107311957206d802d611b2720a731200d6128c72110295917212720bd803d613b2a5731300d614db63087213d615b272147314009683050193c27213d08c72110193c172137315938c7215017203937e8c72150206721293b172147316731773187202"
];

export function extractTokenIdFromOrderContract(contract: string) {
  if (
    contract.startsWith(ORDER_ON_CLOSE_TOKEN_CONTRACT_TEMPLATE[0]) ||
    contract.startsWith(ORDER_FIXED_TOKEN_CONTRACT_TEMPLATE[0])
  ) {
    const start = ORDER_ON_CLOSE_TOKEN_CONTRACT_TEMPLATE[0].length;

    return contract.substring(start, start + 64);
  }

  return ERG_TOKEN_ID;
}

export function buildOrderContract(tokenId: string, type: OpenOrderType) {
  if (tokenId === ERG_TOKEN_ID) {
    return type === "on-close" ? ORDER_ON_CLOSE_ERG_CONTRACT : ORDER_FIXED_ERG_CONTRACT;
  }

  const hash = hex.encode(blake2b256(hex.decode(buildBondContract(tokenId))));
  const template =
    type === "on-close"
      ? ORDER_ON_CLOSE_TOKEN_CONTRACT_TEMPLATE
      : ORDER_FIXED_TOKEN_CONTRACT_TEMPLATE;

  return buildFromTemplate(template, [tokenId, hash]);
}

function buildFromTemplate(template: string[], constants: string[]) {
  const ret: string[] = [];
  const len = template.length > constants.length ? template.length : constants.length;

  for (let i = 0; i < len; i++) {
    if (isDefined(template[i])) {
      ret.push(template[i]);
    }

    if (isDefined(constants[i])) {
      ret.push(constants[i]);
    }
  }

  return ret.join("");
}

export function OpenOrderPlugin(order: OpenOrderParams): FleetPlugin {
  // todo: add collateral inclusion guard
  // todo: add maturity check based on contract type

  if (order.maturityLength >= STORAGE_PERIOD) {
    throw `The term is over storage rent period of ${STORAGE_PERIOD} blocks.`;
  }

  return ({ addOutputs }) => {
    let amount = ensureBigInt(order.collateral.nanoErgs || 0n);
    if (amount <= 0n) {
      amount = SAFE_MIN_BOX_VALUE;
    }

    const contract = buildOrderContract(order.loan.tokenId, "on-close");
    const output = new OutputBuilder(amount, contract)
      .addTokens(order.collateral.tokens || [])
      .setAdditionalRegisters({
        R4: SSigmaProp(SGroupElement(first(order.borrower.getPublicKeys()))).toHex(),
        R5: SLong(order.loan.amount).toHex(),
        R6: SLong(order.loan.repayment).toHex(),
        R7: SInt(order.maturityLength).toHex()
      });

    addOutputs(output, { index: 0 });
  };
}

export const ERG_BOND_CONTRACT =
  "100204000402d805d601b2a5730000d602e4c6a70808d603db6308a7d604c1a7d605e4c6a705089592a3e4c6a70704d19683040193c27201d0720293db63087201720393c17201720493e4c67201040ec5a7d801d606b2a5730100ea02d19683060193c27201d0720293c17201e4c6a7060593e4c67201040ec5a793c27206d0720593db63087206720393c1720672047205";
export const TOKEN_BOND_CONTRACT_TEMPLATE = [
  "10060400040004020580897a0e20",
  "0402d805d601b2a5730000d602e4c6a70808d603db6308a7d604c1a7d605e4c6a705089592a3e4c6a70704d19683040193c27201d0720293db63087201720393c17201720493e4c67201040ec5a7d803d606db63087201d607b27206730100d608b2a5730200ea02d19683090193c27201d0720293c172017303938c7207017304938c720702e4c6a7060593b17206730593e4c67201040ec5a793c27208d0720593db63087208720393c1720872047205"
];

const CONTRACT_DEV_FEE_CONTRACT =
  "0008cd03a11d3028b9bc57b6ac724485e99960b89c278db6bab5d2b961b01aee29405a02";

export function buildBondContract(tokenId: string) {
  if (tokenId === ERG_TOKEN_ID) {
    return ERG_BOND_CONTRACT;
  }

  return TOKEN_BOND_CONTRACT_TEMPLATE.join(tokenId);
}

export function extractTokenIdFromBondContract(contract: string) {
  if (contract.startsWith(TOKEN_BOND_CONTRACT_TEMPLATE[0])) {
    const start = TOKEN_BOND_CONTRACT_TEMPLATE[0].length;

    return contract.substring(start, start + 64);
  }

  return ERG_TOKEN_ID;
}

export function CancelOrderPlugin(orderBox: Box<Amount>, destination: ErgoAddress): FleetPlugin {
  // todo: add validation if orderBox is valid
  // todo: add validation if orderBox is spendably by destination pk

  return ({ addInputs, addOutputs }) => {
    addInputs(orderBox);
    addOutputs(new OutputBuilder(orderBox.value, destination).addTokens(orderBox.assets));
  };
}

export function CloseOrderPlugin(
  orderBox: Box<Amount>,
  params: { lender: ErgoAddress; currentHeight: number; uiImplementor: ErgoAddress }
): FleetPlugin {
  // todo: validate orderbox

  return ({ addInputs, addOutputs }) => {
    addInputs(
      new ErgoUnsignedInput(orderBox).setContextVars({
        0: SSigmaProp(SGroupElement(first(params.uiImplementor.getPublicKeys()))).toHex()
      })
    );

    if (!orderBox.additionalRegisters.R4)
      throw new Error("Invalid order. Borrower public key is not present.");
    if (!orderBox.additionalRegisters.R5)
      throw new Error("Invalid order. Lend amount is not present.");
    if (!orderBox.additionalRegisters.R6)
      throw new Error("Invalid order. Total repayment amount is not present.");
    if (!orderBox.additionalRegisters.R7)
      throw new Error("Invalid order. Lend term is no present.");

    const amount = parse<bigint>(orderBox.additionalRegisters.R5);
    const term = parse<number>(orderBox.additionalRegisters.R7);
    if (term >= STORAGE_PERIOD) {
      throw `The term is over storage rent period of ${STORAGE_PERIOD} blocks.`;
    }

    const tokenId = extractTokenIdFromOrderContract(orderBox.ergoTree);
    const isErg = tokenId === ERG_TOKEN_ID;
    const bond = new OutputBuilder(orderBox.value, buildBondContract(tokenId))
      .addTokens(orderBox.assets)
      .setAdditionalRegisters({
        R4: SColl(SByte, orderBox.boxId).toHex(),
        R5: orderBox.additionalRegisters.R4,
        R6: orderBox.additionalRegisters.R6,
        R7: SInt(params.currentHeight + term).toHex(),
        R8: SSigmaProp(SGroupElement(first(params.lender.getPublicKeys()))).toHex()
      });

    const loanAmount = parse<bigint>(orderBox.additionalRegisters.R5);
    const loan = new OutputBuilder(
      isErg ? loanAmount : SAFE_MIN_BOX_VALUE,
      ErgoAddress.fromPublicKey(orderBox.additionalRegisters.R4.substring(4))
    );

    if (!isErg) {
      loan.addTokens({ tokenId, amount: loanAmount });
    }

    const outputs = [bond, loan];
    const contractDevFeeAmount = (500n * amount) / 100000n;
    const uiFeeAmount = (400n * amount) / 100000n;

    if (isErg) {
      outputs.push(new OutputBuilder(contractDevFeeAmount, CONTRACT_DEV_FEE_CONTRACT));
      outputs.push(new OutputBuilder(uiFeeAmount, params.uiImplementor));
    } else {
      const ctxFeeOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, CONTRACT_DEV_FEE_CONTRACT);
      const uiFeeOutput = new OutputBuilder(SAFE_MIN_BOX_VALUE, params.uiImplementor);

      if (contractDevFeeAmount > 0n) {
        ctxFeeOutput.addTokens({
          tokenId,
          amount: contractDevFeeAmount
        });
      }

      if (uiFeeAmount > 0n) {
        uiFeeOutput.addTokens({
          tokenId,
          amount: uiFeeAmount
        });
      }

      outputs.push(ctxFeeOutput);
      outputs.push(uiFeeOutput);
    }

    addOutputs(outputs, { index: 0 });
  };
}

export function LiquidatePlugin(bondBox: Box<Amount>, recipient: ErgoAddress): FleetPlugin {
  // todo: add validation if orderBox is valid
  // todo: add validation if orderBox is spendably by destination pk

  return ({ addInputs, addOutputs }) => {
    addInputs(bondBox);

    addOutputs(
      new OutputBuilder(bondBox.value, recipient)
        .addTokens(bondBox.assets)
        .setAdditionalRegisters({ R4: SColl(SByte, bondBox.boxId).toHex() }),
      { index: 0 }
    );
  };
}

export function RepayPlugin(bondBox: Box<Amount>): FleetPlugin {
  return ({ addInputs, addOutputs }) => {
    if (!bondBox.additionalRegisters.R5) {
      throw new Error("Invalid bond. Borrower public key is not present.");
    }
    if (!bondBox.additionalRegisters.R6) {
      throw new Error("Invalid bond. Repayment amount is not present.");
    }
    if (!bondBox.additionalRegisters.R8) {
      throw new Error("Invalid bond. Lender public key is not present.");
    }

    const repaymentAmount = parse<bigint>(bondBox.additionalRegisters.R6);
    const borrower = ErgoAddress.fromPublicKey(bondBox.additionalRegisters.R5.substring(4));
    const lender = ErgoAddress.fromPublicKey(bondBox.additionalRegisters.R8.substring(4));
    const tokenId = extractTokenIdFromBondContract(bondBox.ergoTree);

    const returnCollateral = new OutputBuilder(bondBox.value, borrower).addTokens(bondBox.assets);
    const repayment = (
      tokenId === ERG_TOKEN_ID
        ? new OutputBuilder(repaymentAmount, lender)
        : new OutputBuilder(SAFE_MIN_BOX_VALUE, lender).addTokens({
            tokenId,
            amount: repaymentAmount
          })
    ).setAdditionalRegisters({ R4: SColl(SByte, bondBox.boxId).toHex() });

    addInputs(bondBox);
    addOutputs([repayment, returnCollateral], { index: 0 });
  };
}

// ========================================
// COMET AUCTION CONTRACT V3
// ========================================

// ⚠️ TODO: Replace with complete V3 ErgoTree from compilation
// V3 Contract adds 3 new registers:
// - R6: Bid count (0-1000 max)
// - R7: Last bid height
// - R8: Winner claimed flag (0 or 1)
//
// New features:
// - 10% minimum bid increment (dynamic)
// - Grace period (30 blocks after deadline)
// - Max bids per round (1000)
// - Winner claimed flag tracking
export const COMET_AUCTION_CONTRACT =
  "1aa0093d040204000580897a040204020e200cd8c9f416e5b1ca9f986a7f10a84191dfb85941619e49e53c0dc30ebf83324b" +
  "0400050005000400050205c80105140580897a05c80105140e2413a721aadf21970441d32e5383e5218b3b322e21b233ede5" +
  "03c68bf3523093e645c047fd0500050a050a0e260102abfec334e1d585356fa219b03fd127ddfd4bb82a13c0397cdaba6fe16" +
  "19af01ac0e910b705d00f050205c09a0c05c09a0c0580a8d6b9070580a8d6b907053c04060402040404000400050205d00505" +
  "000402040004000580897a0402040004000580897a040404020400040004020400040005020580897a0580897a0502040205" +
  "0005c09a0c05000580a8d6b9070502d82dd6017ea305d602e4c6a70405d603e4c6a70605d604b1a5d6059372047300d606b2" +
  "a5730100d607c27206d608937207c2a7d609c17206d60a9272097302d60bdb63087206d60c92720c7303d60d93720c7304d6" +
  "0e7305d60f95720db2720b7306008602720f7307d610e4c672060405d6119372107202d612e4c672060605d613e4c6720607" +
  "05d6149372137201d615e4c672060805d6169372157308d617e4c672060508d6188c721002d619db6308a7d61ab2721a7309" +
  "00d61b8c721a02d61c99721b730ad61d9d721c730bd61e9c721d730cd61fc1a7d620997220730dd6219d7220730ed6229c72" +
  "21730fd623cdee7310d624e4c6a70805d625d19372247311d626e4c6a70508d6279c721d7312d62899721c7227d6299c7221" +
  "730fd62a997220722ad62bcdee7313d62cd19272017202eb02eb02eb02eb02ea02ea02ea02d1eded8f720172028f72037314" +
  "edededededededed72057208720a720ced720d938c720f01720e721093721293a72037315721472167217d1eced9272189a72" +
  "1b958f721e73167317721e9372097220ed937218721b9272099a7220958f72227318731972229d1927218721dea02ea02ea02" +
  "d19272019a7202731a72237225d1ed937204731bd802d62db2a5731c00d62eb2a5731d00ededededededededededed720872" +
  "0a720d938cb2720b731e0001720e928cb2720b731f000273209372109a72017321937217722393721272229372127202eded" +
  "eded93c2722dd0722693b1db6308722d7323938cb2db6308722d73240001720e928cb2db6308722d73250002722892c1722d" +
  "722a92c1722d7326ededededed93c2722ed0722b93b1db6308722e7327938cb2db6308722e73280001720e928cb2db630872" +
  "2e732900029a72277329732a92c1722e7329722992c1722e732bea02ea02ea02722c72267225d1ed937204732cd801d62db2" +
  "a5732d00edededededd937207d0722b720d938cb2720b732e0001720e928cb2720b732f00027227927209729a720aedededed" +
  "ed93c2722dd0722693b1db6308722d7330938cb2db6308722d73310001720e928cb2db6308722d733200029a7228733392c1" +
  "722d9a722a733492c1722d7335ea02ea02ea02d19372247336722bd1ececec91b1721a7337948c721a01720ded91721c7338" +
  "8f721c7339ed917220733a8f7220733bd1937207d0722bea02ea02ea02722ceb027226722b7225d1ed7205ededededededed" +
  "7208937209721f93720b721a721193721772269372127203937213e4c6a70705937215733c";

export type BidType = "comet" | "erg";

export type AuctionBidParams = {
  bidType: BidType;
  bidder: ErgoAddress;
};

// Plugin to create the genesis (first) auction box
// V3: Initializes R6 (bid count), R7 (start height), R8 (claimed flag)
export function AuctionGenesisPlugin(currentHeight: number): FleetPlugin {
  return ({ addOutputs }) => {
    // Create the first auction box with base amounts
    // Convert ErgoTree to ErgoAddress for proper serialization
    const contractAddress = ErgoAddress.fromErgoTree(COMET_AUCTION_CONTRACT, getNetworkType());
    const genesisBox = new OutputBuilder(BASE_ERG_AMOUNT, contractAddress)
      .addTokens(
        new TokensCollection([
          {
            tokenId: COMET_TOKEN_ID,
            amount: BASE_COMET_AMOUNT
          }
        ])
      )
      .setAdditionalRegisters({
        R4: SLong(BigInt(currentHeight) + BID_DURATION).toHex(), // Bid deadline
        R5: SSigmaProp(SGroupElement(first(ErgoAddress.fromBase58(BOT_PK).getPublicKeys()))).toHex(), // Bot as initial "bidder"
        R6: SLong(0n).toHex(), // V3: Bid count = 0
        R7: SLong(BigInt(currentHeight)).toHex(), // V3: Start height
        R8: SLong(0n).toHex() // V3: Winner claimed flag = 0
      });

    addOutputs(genesisBox, { index: 0 });
  };
}

// Plugin to place a bid on the auction
// V3: Increments R6 (bid count), updates R7 (current height), keeps R8 = 0
// Note: The actual bid amount should be validated by TransactionFactory before calling this
export function AuctionBidPlugin(
  auctionBox: Box<Amount>,
  params: AuctionBidParams,
  currentHeight: number,
  bidAmount: bigint  // Actual bid amount (already validated for 10% minimum)
): FleetPlugin {
  return ({ addInputs, addOutputs }) => {
    // Validate required registers
    if (!auctionBox.additionalRegisters.R4) {
      throw new Error("Invalid auction box. Bid deadline not present.");
    }
    if (!auctionBox.additionalRegisters.R5) {
      throw new Error("Invalid auction box. Last bidder not present.");
    }
    if (!auctionBox.additionalRegisters.R6) {
      throw new Error("Invalid auction box. Bid count not present (V3 required).");
    }
    if (!auctionBox.additionalRegisters.R7) {
      throw new Error("Invalid auction box. Last bid height not present (V3 required).");
    }
    if (!auctionBox.additionalRegisters.R8) {
      throw new Error("Invalid auction box. Winner claimed flag not present (V3 required).");
    }

    // Parse current state
    const bidDeadline = parse<bigint>(auctionBox.additionalRegisters.R4);
    const bidCount = parse<bigint>(auctionBox.additionalRegisters.R6);
    const currentCometAmount = auctionBox.assets[0]?.amount
      ? BigInt(auctionBox.assets[0].amount)
      : 0n;
    const currentErgAmount = BigInt(auctionBox.value);

    // Add auction box as input
    addInputs(auctionBox);

    // Calculate new amounts
    const newCometAmount =
      params.bidType === "comet"
        ? currentCometAmount + bidAmount
        : currentCometAmount;

    const newErgAmount =
      params.bidType === "erg"
        ? currentErgAmount + bidAmount
        : currentErgAmount;

    // Create new auction box with updated bid
    const contractAddress = ErgoAddress.fromErgoTree(COMET_AUCTION_CONTRACT, getNetworkType());
    const newAuctionBox = new OutputBuilder(
      newErgAmount,
      contractAddress
    );

    newAuctionBox.addTokens(
      new TokensCollection([
        {
          tokenId: COMET_TOKEN_ID,
          amount: newCometAmount
        }
      ])
    );

    // Set all registers including V3 additions
    newAuctionBox.setAdditionalRegisters({
      R4: SLong(bidDeadline).toHex(), // Keep same deadline
      R5: SSigmaProp(SGroupElement(first(params.bidder.getPublicKeys()))).toHex(), // New bidder
      R6: SLong(bidCount + 1n).toHex(), // V3: Increment bid count
      R7: SLong(BigInt(currentHeight)).toHex(), // V3: Update to current height
      R8: SLong(0n).toHex() // V3: Keep claimed flag = 0
    });

    addOutputs(newAuctionBox, { index: 0 });
  };
}

// Plugin for manual claim by winner
export function AuctionManualClaimPlugin(
  auctionBox: Box<Amount>,
  winner: ErgoAddress
): FleetPlugin {
  return ({ addInputs, addOutputs }) => {
    if (!auctionBox.additionalRegisters.R5) {
      throw new Error("Invalid auction box. Last bidder not present.");
    }

    const totalCometAmount = auctionBox.assets[0]?.amount
      ? BigInt(auctionBox.assets[0].amount)
      : 0n;
    const totalErgAmount = BigInt(auctionBox.value);

    // Calculate winnable pot (total - base)
    const winnableCometAmount = totalCometAmount - BASE_COMET_AMOUNT;
    const winnableErgAmount = totalErgAmount - BASE_ERG_AMOUNT;

    // Calculate dev fees
    const devCometFee = (winnableCometAmount * DEV_FEE_PERCENT) / 100n;
    const devErgFee = (winnableErgAmount * DEV_FEE_PERCENT) / 100n;

    // Calculate winner amounts
    const winnerCometAmount = winnableCometAmount - devCometFee;
    const winnerErgAmount = winnableErgAmount - devErgFee;

    addInputs(auctionBox);

    // Output 0: Dev fee box
    const devBox = new OutputBuilder(
      devErgFee > SAFE_MIN_BOX_VALUE ? devErgFee : SAFE_MIN_BOX_VALUE,
      ErgoAddress.fromBase58(OWNER_PK)
    );
    if (devCometFee > 0n) {
      devBox.addTokens(
        new TokensCollection([
          {
            tokenId: COMET_TOKEN_ID,
            amount: devCometFee
          }
        ])
      );
    }

    // Output 1: Winner box (includes base amounts)
    const winnerBox = new OutputBuilder(
      winnerErgAmount + BASE_ERG_AMOUNT,
      winner
    ).addTokens(
      new TokensCollection([
        {
          tokenId: COMET_TOKEN_ID,
          amount: winnerCometAmount + BASE_COMET_AMOUNT
        }
      ])
    );

    addOutputs([devBox, winnerBox], { index: 0 });
  };
}

// Plugin for bot auto-distribution
// V3: Checks grace period, resets all registers (R4-R8) for new round
export function AuctionAutoDistributePlugin(
  auctionBox: Box<Amount>,
  currentHeight: number
): FleetPlugin {
  return ({ addInputs, addOutputs }) => {
    // Validate all registers present
    if (!auctionBox.additionalRegisters.R4) throw new Error("Missing R4 (deadline)");
    if (!auctionBox.additionalRegisters.R5) throw new Error("Missing R5 (bidder)");
    if (!auctionBox.additionalRegisters.R6) throw new Error("Missing R6 (bid count) - V3 required");
    if (!auctionBox.additionalRegisters.R7) throw new Error("Missing R7 (last bid height) - V3 required");
    if (!auctionBox.additionalRegisters.R8) throw new Error("Missing R8 (claimed flag) - V3 required");

    // Parse registers
    const deadline = parse<bigint>(auctionBox.additionalRegisters.R4);
    const lastBidderPK = auctionBox.additionalRegisters.R5;
    const winnerClaimedFlag = parse<bigint>(auctionBox.additionalRegisters.R8);

    // V3: Check grace period (deadline + 30 blocks)
    const graceDeadline = Number(deadline) + Number(GRACE_PERIOD);
    if (currentHeight < graceDeadline) {
      const blocksRemaining = graceDeadline - currentHeight;
      throw new Error(`Grace period not over. Wait ${blocksRemaining} more blocks (~${blocksRemaining * 0.5} minutes)`);
    }

    // V3: Check not already claimed
    if (winnerClaimedFlag !== 0n) {
      throw new Error("Winner already claimed. Cannot auto-distribute.");
    }

    const totalCometAmount = auctionBox.assets[0]?.amount
      ? BigInt(auctionBox.assets[0].amount)
      : 0n;
    const totalErgAmount = BigInt(auctionBox.value);

    // Calculate winnable pot (total - base)
    const winnableCometAmount = totalCometAmount - BASE_COMET_AMOUNT;
    const winnableErgAmount = totalErgAmount - BASE_ERG_AMOUNT;

    // V3: SAFE fee calculation (divide first to prevent overflow)
    const devCometFee = (winnableCometAmount / 100n) * DEV_FEE_PERCENT;
    const devErgFee = (winnableErgAmount / 100n) * DEV_FEE_PERCENT;

    // Calculate winner amounts (NO base - goes to new auction)
    const winnerCometAmount = winnableCometAmount - devCometFee;
    const winnerErgAmount = winnableErgAmount - devErgFee;

    // V3: Validate minimum thresholds
    if (devErgFee < MIN_PAYMENT_THRESHOLD) {
      throw new Error("Dev fee below minimum threshold");
    }
    if (winnerErgAmount < MIN_PAYMENT_THRESHOLD) {
      throw new Error("Winner amount below minimum threshold");
    }

    addInputs(auctionBox);

    // Output 0: New auction box (MUST BE FIRST, reset to base amounts)
    // V3: Initialize ALL registers for new round
    const contractAddress = ErgoAddress.fromErgoTree(COMET_AUCTION_CONTRACT, getNetworkType());
    const newAuctionBox = new OutputBuilder(BASE_ERG_AMOUNT, contractAddress)
      .addTokens(
        new TokensCollection([
          {
            tokenId: COMET_TOKEN_ID,
            amount: BASE_COMET_AMOUNT
          }
        ])
      )
      .setAdditionalRegisters({
        R4: SLong(BigInt(currentHeight) + BID_DURATION).toHex(), // New deadline
        R5: SSigmaProp(SGroupElement(first(ErgoAddress.fromBase58(BOT_PK).getPublicKeys()))).toHex(), // Bot as initial "bidder"
        R6: SLong(0n).toHex(), // V3: Reset bid count to 0
        R7: SLong(BigInt(currentHeight)).toHex(), // V3: New start height
        R8: SLong(0n).toHex() // V3: Reset claimed flag to 0
      });

    // Output 1: Winner box
    const winnerAddress = ErgoAddress.fromPublicKey(lastBidderPK.substring(4));
    const winnerBox = new OutputBuilder(
      winnerErgAmount > SAFE_MIN_BOX_VALUE ? winnerErgAmount : SAFE_MIN_BOX_VALUE,
      winnerAddress
    );
    if (winnerCometAmount > 0n) {
      winnerBox.addTokens(
        new TokensCollection([
          {
            tokenId: COMET_TOKEN_ID,
            amount: winnerCometAmount
          }
        ])
      );
    }

    // Output 2: Dev fee box
    const devBox = new OutputBuilder(
      devErgFee > SAFE_MIN_BOX_VALUE ? devErgFee : SAFE_MIN_BOX_VALUE,
      ErgoAddress.fromBase58(OWNER_PK)
    );
    if (devCometFee > 0n) {
      devBox.addTokens(
        new TokensCollection([
          {
            tokenId: COMET_TOKEN_ID,
            amount: devCometFee
          }
        ])
      );
    }

    addOutputs([newAuctionBox, winnerBox, devBox], { index: 0 });
  };
}

// Plugin for owner to claim invalid funds
export function AuctionOwnerClaimPlugin(auctionBox: Box<Amount>): FleetPlugin {
  return ({ addInputs, addOutputs }) => {
    addInputs(auctionBox);

    // Clean assets array to ensure they're plain objects and wrap in TokensCollection
    const cleanAssets = auctionBox.assets.map(asset => ({
      tokenId: asset.tokenId,
      amount: asset.amount
    }));

    const ownerBox = new OutputBuilder(auctionBox.value, ErgoAddress.fromBase58(OWNER_PK)).addTokens(
      new TokensCollection(cleanAssets)
    );

    addOutputs(ownerBox, { index: 0 });
  };
}
