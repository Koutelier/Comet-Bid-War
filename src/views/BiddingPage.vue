<script setup lang="ts">
import { GraphQLBoxQuery } from "@fleet-sdk/blockchain-providers";
import { Amount, Box, isEmpty } from "@fleet-sdk/common";
import { computed, reactive, ref, watch } from "vue";
import BigNumber from "bignumber.js";
import {
  COMET_ENTRY_FEE,
  ERG_ENTRY_FEE,
  COMET_DECIMALS,
  ERG_DECIMALS
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
import { stringifyBoxAmounts, decimalizeBigNumber } from "@/utils";

const chain = useChainStore();
const wallet = useWalletStore();

const auctionData = ref<AuctionData | null>(null);
const loading = reactive({ box: true, transaction: false });
const selectedBidType = ref<"comet" | "erg">("comet");
const errorMessage = ref<string>("");
const successMessage = ref<string>("");

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

    auctionData.value = parseAuctionBox(
      box,
      chain.tokensMetadata,
      chain.priceRates,
      chain.height,
      wallet.usedAddresses
    );
  } catch (error) {
    console.error("Error loading auction:", error);
    errorMessage.value = `Failed to load auction: ${error}`;
  } finally {
    loading.box = false;
  }
}

async function placeBid() {
  if (!auctionData.value) return;

  try {
    loading.transaction = true;
    errorMessage.value = "";
    successMessage.value = "";

    await TransactionFactory.placeBid(
      auctionData.value.box as unknown as Box<Amount>,
      selectedBidType.value
    );

    successMessage.value = `🎉 Bid placed successfully! You're now in the lead!`;
    setTimeout(() => loadAuctionBox(), 3000);
  } catch (error) {
    console.error("Error placing bid:", error);
    errorMessage.value = `Failed to place bid: ${error}`;
  } finally {
    loading.transaction = false;
  }
}

const formattedCometFee = computed(() =>
  formatCometAmount(decimalizeBigNumber(BigNumber(COMET_ENTRY_FEE.toString()), COMET_DECIMALS))
);
const formattedErgFee = computed(() =>
  formatErgAmount(decimalizeBigNumber(BigNumber(ERG_ENTRY_FEE.toString()), ERG_DECIMALS))
);

const canBid = computed(() => {
  return (
    auctionData.value &&
    auctionData.value.status === "active" &&
    wallet.connected &&
    !loading.transaction
  );
});
</script>

<template>
  <div class="bidding-page min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8 max-w-5xl">
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-6xl font-extrabold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          🔥 COMET DEGEN BID WAR 🔥
        </h1>
        <p class="text-2xl font-semibold opacity-90">Last bidder wins 95% of the pot!</p>
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
          <h2 class="card-title justify-center text-2xl">⏳ No Active Auction</h2>
          <p class="text-lg">The auction hasn't started yet. Check back soon!</p>
        </div>
      </div>

      <!-- Active Auction -->
      <div v-else class="space-y-8">
        <!-- Prize Pool Display -->
        <div class="card bg-gradient-to-br from-primary via-secondary to-accent text-primary-content shadow-2xl transform hover:scale-[1.02] transition-transform">
          <div class="card-body p-8">
            <h2 class="card-title justify-center text-4xl mb-6 font-extrabold">💰 CURRENT PRIZE POOL 💰</h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- COMET Prize -->
              <div class="stat bg-base-100 text-base-content rounded-xl shadow-lg p-6 border-2 border-primary">
                <div class="stat-figure text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-12 h-12 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div class="stat-title text-lg font-semibold">COMET Pot</div>
                <div class="stat-value text-3xl text-primary">{{ formatCometAmount(auctionData.cometPot.total) }}</div>
                <div class="stat-desc text-base font-medium mt-2">Winner gets: {{ formatCometAmount(auctionData.winnerPrize.comet) }}</div>
              </div>

              <!-- ERG Prize -->
              <div class="stat bg-base-100 text-base-content rounded-xl shadow-lg p-6 border-2 border-secondary">
                <div class="stat-figure text-secondary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-12 h-12 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </div>
                <div class="stat-title text-lg font-semibold">ERG Pot</div>
                <div class="stat-value text-3xl text-secondary">{{ formatErgAmount(auctionData.ergPot.total) }}</div>
                <div class="stat-desc text-base font-medium mt-2">Winner gets: {{ formatErgAmount(auctionData.winnerPrize.erg) }}</div>
              </div>
            </div>

            <!-- Total Value USD -->
            <div v-if="auctionData.totalValueUSD" class="text-center mt-8 p-6 bg-base-100/20 rounded-xl">
              <div class="text-lg font-semibold opacity-80 mb-2">Total Prize Value</div>
              <div class="text-5xl font-extrabold drop-shadow-lg">${{ auctionData.totalValueUSD.toFormat(2) }}</div>
            </div>
          </div>
        </div>

        <!-- Auction Status -->
        <div class="card bg-base-200 shadow-2xl border-2 border-accent">
          <div class="card-body p-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="text-center md:text-left">
                <h3 class="text-xl font-bold mb-3 flex items-center justify-center md:justify-start gap-2">
                  <span class="text-3xl">⏱️</span>
                  <span>Time Remaining</span>
                </h3>
                <p class="text-5xl font-extrabold text-primary mb-2">{{ auctionData.timeRemaining }}</p>
                <p class="text-lg opacity-70">{{ auctionData.blocksRemaining }} blocks left</p>
              </div>
              <div class="text-center md:text-right">
                <h3 class="text-xl font-bold mb-3 flex items-center justify-center md:justify-end gap-2">
                  <span class="text-3xl">👑</span>
                  <span>Current Leader</span>
                </h3>
                <p class="text-sm font-mono break-all bg-base-300 p-3 rounded-lg">{{ auctionData.lastBidder.substring(0, 30) }}...</p>
                <div v-if="auctionData.isUserLastBidder" class="badge badge-success badge-lg mt-3 text-lg font-bold">
                  🎉 YOU'RE WINNING! 🎉
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bidding Card -->
        <div class="card bg-gradient-to-br from-base-300 to-base-200 shadow-2xl border-4 border-primary">
          <div class="card-body p-8">
            <h2 class="card-title text-3xl mb-6 justify-center font-extrabold">🎯 PLACE YOUR BID 🎯</h2>

            <!-- Wallet Connection -->
            <div v-if="!wallet.connected" class="alert alert-warning">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span>Connect your wallet to place a bid</span>
            </div>

            <div v-else-if="auctionData.status === 'active'" class="space-y-8">
              <!-- Bid Type Selection -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text text-2xl font-bold mb-2">Choose Your Weapon</span>
                </label>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button
                    class="btn btn-lg h-auto py-6 transform transition-all hover:scale-105"
                    :class="selectedBidType === 'comet' ? 'btn-primary shadow-xl border-4 border-primary-focus' : 'btn-outline btn-primary'"
                    @click="selectedBidType = 'comet'"
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="text-4xl">⚡</div>
                      <div class="text-sm opacity-70">Bid with</div>
                      <div class="text-2xl font-extrabold">COMET</div>
                      <div class="text-lg font-semibold">{{ formattedCometFee }} tokens</div>
                    </div>
                  </button>
                  <button
                    class="btn btn-lg h-auto py-6 transform transition-all hover:scale-105"
                    :class="selectedBidType === 'erg' ? 'btn-secondary shadow-xl border-4 border-secondary-focus' : 'btn-outline btn-secondary'"
                    @click="selectedBidType = 'erg'"
                  >
                    <div class="flex flex-col items-center gap-2">
                      <div class="text-4xl">💎</div>
                      <div class="text-sm opacity-70">Bid with</div>
                      <div class="text-2xl font-extrabold">ERG</div>
                      <div class="text-lg font-semibold">{{ formattedErgFee }} ERG</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Bid Button -->
              <button
                class="btn btn-lg w-full text-2xl h-20 font-extrabold transform transition-all hover:scale-105 shadow-2xl"
                :class="selectedBidType === 'comet' ? 'btn-primary' : 'btn-secondary'"
                :disabled="!canBid"
                @click="placeBid"
              >
                <span v-if="loading.transaction">
                  <span class="loading loading-spinner loading-lg"></span>
                  Processing...
                </span>
                <span v-else>
                  🚀 PLACE BID: {{ selectedBidType === 'comet' ? formattedCometFee + ' COMET' : formattedErgFee + ' ERG' }} 🚀
                </span>
              </button>

              <!-- Info -->
              <div class="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div>
                  <div class="font-bold">Winner Takes 95%!</div>
                  <div class="text-sm">Your bid increases the pot. Last bidder when time runs out wins!</div>
                </div>
              </div>
            </div>

            <div v-else class="alert alert-warning">
              <span>This auction has ended. A new round will start soon.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bidding-page {
  background: linear-gradient(135deg,
    rgba(99, 102, 241, 0.15) 0%,
    rgba(168, 85, 247, 0.15) 50%,
    rgba(236, 72, 153, 0.15) 100%
  );
  background-attachment: fixed;
}
</style>
