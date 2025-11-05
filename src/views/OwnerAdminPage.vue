<script setup lang="ts">
import { GraphQLBoxQuery } from "@fleet-sdk/blockchain-providers";
import { Amount, Box, isEmpty } from "@fleet-sdk/common";
import { ErgoAddress } from "@fleet-sdk/core";
import { computed, reactive, ref, watch } from "vue";
import BigNumber from "bignumber.js";
import {
  OWNER_PK,
  COMET_TOKEN_ID,
  ERG_TOKEN_ID
} from "@/constants";
import { COMET_AUCTION_CONTRACT } from "@/offchain/plugins";
import { TransactionFactory } from "@/offchain/transactionFactory";
import { graphQLService } from "@/services/graphqlService";
import { useChainStore } from "@/stories";
import { useWalletStore } from "@/stories/walletStore";
import {
  parseAuctionBox,
  formatCometAmount,
  formatErgAmount,
  AuctionData
} from "@/utils/auctionUtils";
import { stringifyBoxAmounts, getNetworkType } from "@/utils";

const chain = useChainStore();
const wallet = useWalletStore();

const auctionData = ref<AuctionData | null>(null);
const loading = reactive({ box: true, transaction: false });
const errorMessage = ref<string>("");
const successMessage = ref<string>("");

// Owner detection
const isOwnerWallet = computed(() => {
  if (!wallet.connected) return false;
  const addresses = [wallet.changeAddress, ...wallet.usedAddresses].filter(addr => addr);
  return addresses.some(addr => addr === OWNER_PK);
});

// Watch for changes
watch(
  () => ({
    height: chain.height,
    walletConnected: wallet.connected
  }),
  async () => {
    await loadAuctionBox();
  },
  { immediate: true }
);

async function loadAuctionBox() {
  try {
    loading.box = true;
    errorMessage.value = "";

    const query: GraphQLBoxQuery = {
      where: {
        ergoTrees: [COMET_AUCTION_CONTRACT]
      }
    };

    const boxes = await graphQLService.getBoxes(query);

    if (isEmpty(boxes)) {
      auctionData.value = null;
      return;
    }

    const box = stringifyBoxAmounts(boxes[0]);
    const tokenIds = box.assets.map((a) => a.tokenId);
    await chain.loadTokensMetadata(tokenIds);

    console.log("📦 Raw box data:", {
      boxId: box.boxId,
      value: box.value,
      assets: box.assets,
      registers: box.additionalRegisters,
      ergoTree: boxes[0].ergoTree, // ErgoTree from blockchain
      ergoTreeLength: boxes[0].ergoTree?.length
    });
    console.log("🔍 Contract comparison:", {
      blockchainErgoTree: boxes[0].ergoTree,
      configuredErgoTree: COMET_AUCTION_CONTRACT,
      match: boxes[0].ergoTree === COMET_AUCTION_CONTRACT
    });

    auctionData.value = parseAuctionBox(
      box,
      chain.tokensMetadata,
      chain.priceRates,
      chain.height,
      wallet.usedAddresses
    );

    console.log("📊 Parsed auction data:", {
      cometTotal: auctionData.value.cometPot.total.toString(),
      ergTotal: auctionData.value.ergPot.total.toString(),
      cometWinnable: auctionData.value.cometPot.winnable.toString(),
      ergWinnable: auctionData.value.ergPot.winnable.toString()
    });
  } catch (error) {
    console.error("Error loading auction:", error);
    errorMessage.value = `Failed to load auction: ${error}`;
  } finally {
    loading.box = false;
  }
}

async function claimAllTokens() {
  if (!auctionData.value) return;

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    await TransactionFactory.ownerClaimAuction(auctionData.value.box as unknown as Box<Amount>);

    successMessage.value = "✅ Successfully claimed all tokens from auction box!";
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error: any) {
    console.error("❌ Error claiming tokens:", error);

    // Try to decode the error message if it's serialized character-by-character
    let decodedError = '';
    if (error && typeof error === 'object' && typeof error[0] === 'string') {
      // Error is serialized as character array
      let i = 0;
      while (error[i] !== undefined) {
        decodedError += error[i];
        i++;
      }
      console.error("📝 Decoded error message:", decodedError);
    }

    console.error("Error type:", typeof error);
    console.error("Error.message:", error?.message);
    console.error("Error.code:", error?.code);
    console.error("Error.info:", error?.info);
    console.error("Error.toString():", error?.toString?.());

    // Log all error properties
    if (error && typeof error === 'object') {
      const errorProps: any = {};
      for (const key in error) {
        try {
          if (typeof error[key] !== 'function') {
            errorProps[key] = error[key];
          }
        } catch (e) {
          errorProps[key] = '<unable to access>';
        }
      }
      console.error("All error properties:", errorProps);
    }

    errorMessage.value = `Failed to claim tokens: ${decodedError || error?.info || error?.message || 'Unknown error'}`;
  } finally {
    loading.transaction = false;
  }
}

const canClaim = computed(() => {
  return isOwnerWallet.value && auctionData.value && !loading.transaction;
});
</script>

<template>
  <div class="owner-admin-page min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8 max-w-5xl">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-4xl font-bold mb-2">🛡️ Owner Admin Panel</h1>
        <p class="text-xl opacity-80">Manage auction contract and claim tokens</p>
      </div>

      <!-- Owner Verification -->
      <div v-if="!isOwnerWallet" class="alert alert-error shadow-lg mb-6">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div>
            <h3 class="font-bold">Access Denied</h3>
            <div class="text-sm">You must connect the owner wallet to access this page.</div>
          </div>
        </div>
      </div>

      <!-- Owner Debug Info -->
      <div v-if="wallet.connected" class="card bg-base-300 shadow-xl mb-6 border-2" :class="isOwnerWallet ? 'border-success' : 'border-error'">
        <div class="card-body">
          <h3 class="card-title text-sm">🔐 Owner Verification</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            <div class="md:col-span-2">
              <strong>Your Address:</strong><br/>
              <span class="bg-base-100 p-1 rounded break-all">{{ wallet.changeAddress || 'N/A' }}</span>
            </div>
            <div class="md:col-span-2">
              <strong>Expected Owner PK:</strong><br/>
              <span class="bg-base-100 p-1 rounded break-all">{{ OWNER_PK }}</span>
            </div>
            <div>
              <strong>Is Owner:</strong>
              <span :class="isOwnerWallet ? 'text-success font-bold' : 'text-error font-bold'">
                {{ isOwnerWallet ? '✅ YES' : '❌ NO' }}
              </span>
            </div>
            <div>
              <strong>Can Claim:</strong>
              <span :class="canClaim ? 'text-success font-bold' : 'text-error font-bold'">
                {{ canClaim ? '✅ YES' : '❌ NO' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Messages -->
      <div v-if="errorMessage" class="alert alert-error mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>{{ errorMessage }}</span>
      </div>

      <div v-if="successMessage" class="alert alert-success mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>{{ successMessage }}</span>
      </div>

      <!-- Loading -->
      <div v-if="loading.box" class="flex justify-center items-center py-20">
        <div class="loading loading-spinner loading-lg"></div>
      </div>

      <!-- No Auction -->
      <div v-else-if="!auctionData" class="card bg-base-200 shadow-xl">
        <div class="card-body text-center">
          <h2 class="card-title justify-center text-2xl">📭 No Auction Box Found</h2>
          <p class="text-lg">There is no active auction contract box to manage.</p>
        </div>
      </div>

      <!-- Admin Panel (Owner Only) -->
      <div v-else-if="isOwnerWallet" class="space-y-6">
        <!-- Auction Box Info -->
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">📦 Current Auction Box</h2>

            <div class="stats stats-vertical lg:stats-horizontal shadow">
              <div class="stat">
                <div class="stat-figure text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div class="stat-title">COMET Balance</div>
                <div class="stat-value text-primary">{{ formatCometAmount(auctionData.cometPot.total) }}</div>
                <div class="stat-desc">Total in contract</div>
              </div>

              <div class="stat">
                <div class="stat-figure text-secondary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </div>
                <div class="stat-title">ERG Balance</div>
                <div class="stat-value text-secondary">{{ formatErgAmount(auctionData.ergPot.total) }}</div>
                <div class="stat-desc">Total in contract</div>
              </div>

              <div class="stat">
                <div class="stat-title">Auction Status</div>
                <div class="stat-value text-sm">{{ auctionData.status.toUpperCase() }}</div>
                <div class="stat-desc">{{ auctionData.timeRemaining }} remaining</div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="text-sm font-mono">
              <strong>Box ID:</strong> {{ auctionData.box.boxId }}<br/>
              <strong>Last Bidder:</strong> {{ auctionData.lastBidder }}<br/>
              <strong>Deadline Block:</strong> {{ auctionData.bidDeadline }}<br/>
              <strong>Current Block:</strong> {{ chain.height }}
            </div>
          </div>
        </div>

        <!-- Claim Actions -->
        <div class="card bg-base-300 shadow-2xl border-2 border-warning">
          <div class="card-body">
            <h2 class="card-title text-2xl">⚠️ Owner Actions</h2>

            <div class="alert alert-warning">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                <h3 class="font-bold">Emergency Function</h3>
                <div class="text-sm">Use this to claim tokens from invalid/stuck auction boxes.</div>
              </div>
            </div>

            <div class="space-y-4">
              <!-- Claim All Button -->
              <button
                class="btn btn-error btn-lg w-full"
                :disabled="!canClaim"
                @click="claimAllTokens"
              >
                <span v-if="loading.transaction">
                  <span class="loading loading-spinner"></span>
                  Processing...
                </span>
                <span v-else>
                  🚨 Claim All Tokens from Auction Box
                </span>
              </button>

              <!-- Info Card -->
              <div class="card bg-base-200">
                <div class="card-body">
                  <h3 class="font-bold">ℹ️ What This Does:</h3>
                  <ul class="list-disc list-inside space-y-1 text-sm">
                    <li>Claims ALL tokens and ERG from the auction box</li>
                    <li>Sends everything to the owner wallet</li>
                    <li>Used for invalid states or stuck auctions</li>
                    <li>Contract validates owner signature</li>
                  </ul>

                  <div class="divider"></div>

                  <h3 class="font-bold text-warning">⚠️ Use Cases:</h3>
                  <ul class="list-disc list-inside space-y-1 text-sm">
                    <li>Auction box has wrong token amounts</li>
                    <li>Auction box has extra/junk tokens</li>
                    <li>Emergency recovery needed</li>
                    <li>Contract needs to be reset</li>
                  </ul>
                </div>
              </div>

              <!-- Stats -->
              <div class="stats shadow w-full">
                <div class="stat place-items-center">
                  <div class="stat-title">You Will Receive</div>
                  <div class="stat-value text-sm">{{ formatCometAmount(auctionData.cometPot.total) }} COMET</div>
                  <div class="stat-desc">+{{ formatErgAmount(auctionData.ergPot.total) }} ERG</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Contract Info -->
        <div class="card bg-base-200 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">📋 Contract Information</h2>
            <div class="overflow-x-auto">
              <table class="table table-zebra">
                <tbody>
                  <tr>
                    <td class="font-bold">Contract ErgoTree</td>
                    <td class="font-mono text-xs break-all">{{ COMET_AUCTION_CONTRACT.substring(0, 100) }}...</td>
                  </tr>
                  <tr>
                    <td class="font-bold">Owner Public Key</td>
                    <td class="font-mono text-xs">{{ OWNER_PK }}</td>
                  </tr>
                  <tr>
                    <td class="font-bold">Network</td>
                    <td>{{ getNetworkType() === 0 ? 'Mainnet' : 'Testnet' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.owner-admin-page {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%);
}
</style>
