# COMET Auction Contract V2 - Implementation Guide

## Overview

This document describes the implementation of the COMET Auction Contract V2 for the Comet-Bid-War project. The website has been successfully adapted from a lending protocol to an auction system.

## What Has Been Completed ✅

### 1. Contract Constants (`src/constants.ts`)
- Added all V2 auction contract parameters:
  - `COMET_TOKEN_ID`: 0cd8c9f416e5b1ca9f986a7f10a84191dfb85941619e49e53c0dc30ebf83324b
  - `COMET_ENTRY_FEE`: 100000 (0.1 COMET)
  - `ERG_ENTRY_FEE`: 1000000000 (1 ERG)
  - `BID_DURATION`: 360 blocks (~12 hours)
  - `BASE_COMET_AMOUNT`: 1 unit
  - `BASE_ERG_AMOUNT`: 0.001 ERG
  - `DEV_FEE_PERCENT`: 5%
  - `COMET_DECIMALS`: 0
  - `OWNER_PK` and `BOT_PK`: Public keys for owner and bot

### 2. Contract Plugins (`src/offchain/plugins.ts`)
Created FleetSDK plugins for all auction operations:

#### Bidding Plugin (`AuctionBidPlugin`)
- Supports both COMET and ERG bids
- Validates auction box structure
- Creates new auction box with updated bid amounts
- Preserves bid deadline (fixed-round)
- Updates last bidder in R5 register

#### Manual Claim Plugin (`AuctionManualClaimPlugin`)
- Allows winner to manually claim winnings after auction ends
- Calculates dev fees (5% of winnable pot)
- Creates two outputs:
  - Dev fee box (to OWNER_PK)
  - Winner box (includes base amounts + winnings)

#### Auto-Distribution Plugin (`AuctionAutoDistributePlugin`)
- Bot-triggered automatic distribution
- Creates three outputs:
  - New auction box (reset to base amounts, new deadline)
  - Winner box (winnings without base amounts)
  - Dev fee box
- Automatically starts new round

#### Owner Claim Plugin (`AuctionOwnerClaimPlugin`)
- Emergency owner claim for invalid funds
- Sends entire box to owner

### 3. Transaction Factory (`src/offchain/transactionFactory.ts`)
Added public methods for auction transactions:
- `placeBid(auctionBox, bidType)` - Place a COMET or ERG bid
- `claimAuction(auctionBox)` - Manual claim by winner
- `autoDistributeAuction(auctionBox)` - Bot auto-distribution
- `ownerClaimAuction(auctionBox)` - Owner emergency claim

### 4. Auction Utils (`src/utils/auctionUtils.ts`)
Created comprehensive auction box parser:

**Data Structure (`AuctionData`):**
- Bid deadline and blocks remaining
- Last bidder address
- COMET pot (total, winnable, base)
- ERG pot (total, winnable, base)
- Dev fees (COMET and ERG)
- Winner prize amounts
- Total value in USD
- Auction status (active, ended, claimable)
- Time remaining (formatted)
- User status check

**Helper Functions:**
- `parseAuctionBox()` - Parse auction box and extract all data
- `formatCometAmount()` - Format COMET amounts for display
- `formatErgAmount()` - Format ERG amounts for display
- `calculateDevFeePercent()` - Get dev fee percentage

### 5. Chain Store (`src/stories/chainStore.ts`)
- Added `COMET_AUCTION_CONTRACT` to contract addresses for TVL calculation
- Created `getAuctionContractAddress()` helper function
- Contract address automatically tracked for balance queries

### 6. Auction View Component (`src/views/AuctionView.vue`)
Full-featured Vue 3 component with:

**Features:**
- Real-time auction status display
- Countdown timer (blocks and time remaining)
- Prize pool visualization (COMET and ERG)
- USD value calculation
- Bid type selection (COMET or ERG)
- Wallet connection status
- Error and success message handling
- Automatic data refresh

**UI Sections:**
- **Auction Status Card**
  - Status badge (active/ended/claimable)
  - Time remaining
  - Last bidder address
  - "You are winning!" indicator

- **Prize Pool Card**
  - COMET pot with winner amount
  - ERG pot with winner amount
  - Total value in USD

- **Bidding Card**
  - Bid type selector (COMET/ERG)
  - Bid button with dynamic fee display
  - Claim winnings button (when claimable)
  - Wallet connection prompt

### 7. Router Configuration (`src/router.ts`)
- Set AuctionView as home page (`/`)
- Kept bonds market as separate page (`/bonds/`)
- Dashboard remains accessible at `/dashboard/`

### 8. Verified Assets (`src/maps/verifiedAssets.ts`)
- Added COMET token to verified assets list
- Configured with 0 decimals
- Enables price tracking and metadata loading

### 9. Build Configuration
- All TypeScript errors resolved
- Build completes successfully
- Production bundle optimized

## What Still Needs to Be Done ⚠️

### Critical: Compile ErgoScript Contract

The auction contract is currently defined as a placeholder in `src/offchain/plugins.ts`:

```typescript
export const COMET_AUCTION_CONTRACT =
  "PLACEHOLDER_COMPILED_ERGOTREE_HEX_NEEDS_TO_BE_ADDED_HERE";
```

**You MUST compile the ErgoScript contract to ErgoTree bytecode.**

#### Option 1: Using Ergo Playground (Recommended)
1. Go to https://wallet.plutomonkey.com/p2s/
2. Paste the ErgoScript contract code
3. Click "Get P2S Address"
4. Extract the ErgoTree hex from the address

#### Option 2: Using ErgoScriptCompiler CLI
```bash
# Clone the compiler
git clone https://github.com/scalahub/ErgoScriptCompiler
cd ErgoScriptCompiler

# Build with SBT
sbt assembly

# Compile the contract
java -cp target/scala-2.12/ErgoScriptCompiler-assembly-0.1.jar Compile auction_v2.es
```

#### Option 3: Using AppKit (Java/Scala)
```scala
import org.ergoplatform.appkit._

val ergoTree = compiler.compile(Map.empty, contractScript)
val ergoTreeHex = hex.encode(ergoTree.bytes)
```

#### Replace the Placeholder
Once compiled, replace the placeholder in `src/offchain/plugins.ts` line 311:
```typescript
export const COMET_AUCTION_CONTRACT = "YOUR_COMPILED_ERGOTREE_HEX_HERE";
```

### Contract Verification Checklist

Before deployment, verify:
- [ ] Contract compiles without errors
- [ ] ErgoTree hex is correct format (starts with hex digits)
- [ ] Contract address matches expected P2S address
- [ ] Test on testnet before mainnet deployment
- [ ] Verify all contract paths work:
  - [ ] Bid with COMET
  - [ ] Bid with ERG
  - [ ] Manual claim by winner
  - [ ] Auto-distribution by bot
  - [ ] Owner claim for invalid funds

## Contract Register Structure

The auction box uses the following register layout:
- **R4**: `Long` - Bid deadline (block height)
- **R5**: `SigmaProp` - Last bidder public key

## Contract Validation Rules

1. **Valid Bid Path**:
   - Auction must be active (HEIGHT < bidDeadline)
   - New bid must be exactly COMET_ENTRY_FEE or ERG_ENTRY_FEE more
   - Bidder must be in transaction inputs
   - Bid deadline remains unchanged (fixed-round)

2. **Auto-Distribution Path**:
   - Round must be over (HEIGHT >= bidDeadline)
   - Must be signed by BOT_PK
   - Creates 3 outputs: new auction, winner, dev fee
   - New auction resets to base amounts with new deadline

3. **Manual Claim Path**:
   - Round must be over
   - Must be signed by last bidder (winner)
   - Creates 2 outputs: dev fee, winner (includes base amounts)

4. **Owner Claim Path**:
   - Detects invalid funds (wrong tokens, wrong amounts)
   - Must be signed by OWNER_PK
   - Sends all funds to owner

## Development & Testing

### Run Development Server
```bash
npm install
npm run dev
```

### Build for Production
```bash
npm run build
```

### Deploy
```bash
npm run preview  # Test production build locally
```

## Architecture Notes

### Technology Stack
- **Frontend**: Vue 3 (Composition API) + TypeScript
- **Blockchain**: Ergo Platform
- **SDK**: Fleet SDK v0.4-0.5
- **Styling**: TailwindCSS + DaisyUI
- **State Management**: Pinia
- **Build Tool**: Vite

### Key Dependencies
- `@fleet-sdk/core`: Transaction building
- `@fleet-sdk/blockchain-providers`: GraphQL queries
- `@fleet-sdk/serializer`: Register parsing
- `bignumber.js`: Decimal math

### Data Flow
```
AuctionView.vue
    ↓
parseAuctionBox() (auctionUtils.ts)
    ↓
TransactionFactory (transactionFactory.ts)
    ↓
AuctionBidPlugin (plugins.ts)
    ↓
Wallet (EIP-12)
    ↓
Ergo Blockchain
```

## API Endpoints

### GraphQL Service
- **Mainnet**: https://explore.sigmaspace.io/api/graphql/
- **Testnet**: https://tn-ergo-explorer.anetabtc.io/graphql

### Price Data
- Spectrum DEX pools for token prices
- Real-time ERG/USD rate

## Security Considerations

1. **Contract Validation**: All inputs validated before transaction submission
2. **Fee Calculation**: Dev fees calculated server-side to prevent manipulation
3. **Wallet Integration**: Uses EIP-12 standard for wallet communication
4. **Error Handling**: Comprehensive error messages for transaction failures

## Troubleshooting

### "No active auction found"
- Contract hasn't been deployed yet
- Wrong network (mainnet vs testnet)
- ErgoTree hex is incorrect

### Transaction Fails
- Insufficient funds (need COMET or ERG + tx fee)
- Auction has ended
- Someone bid before you (outdated box)
- Wrong wallet connected

### Build Errors
- Run `npm install` to ensure dependencies
- Clear cache: `rm -rf node_modules dist && npm install`
- Check TypeScript version compatibility

## Future Enhancements

Potential improvements:
- [ ] Add transaction history/bid log
- [ ] Show previous winners
- [ ] Add auction statistics (total bids, average pot, etc.)
- [ ] Email/push notifications for auction end
- [ ] Multi-round leaderboard
- [ ] Social sharing features

## Support & Resources

- **Ergo Docs**: https://docs.ergoplatform.com/
- **Fleet SDK**: https://github.com/fleet-sdk/fleet
- **ErgoScript Guide**: https://github.com/ergoplatform/ergoscript-by-example
- **Ergo Forum**: https://www.ergoforum.org/

---

**Last Updated**: 2025-11-04
**Version**: 2.0
**Status**: Implementation Complete (Pending Contract Compilation)
