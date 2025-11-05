<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useChainStore } from "@/stories";
import { useWalletStore } from "@/stories/walletStore";
import {
  fetchHistoricalWinners,
  calculateStats,
  generateLeaderboard,
  filterPersonalWins,
  type WinnerRecord,
  type WinnersStats,
  type LeaderboardEntry
} from "@/services/winnersService";
import { EXPLORER_URL } from "@/constants";

const chain = useChainStore();
const wallet = useWalletStore();
const loading = ref(true);
const error = ref("");

// Data
const winners = ref<WinnerRecord[]>([]);
const stats = ref<WinnersStats>({
  totalRounds: 0,
  totalCometVolume: "0",
  totalErgVolume: "0",
  uniqueWinners: 0
});
const leaderboard = ref<LeaderboardEntry[]>([]);

// UI State
const activeTab = ref<"all" | "personal" | "leaderboard">("all");
const searchAddress = ref("");
const currentPage = ref(1);
const itemsPerPage = 20;

// Computed
const displayedWinners = computed(() => {
  let filtered = winners.value;

  // Filter by tab
  if (activeTab.value === "personal") {
    filtered = filterPersonalWins(filtered, wallet.usedAddresses);
  }

  // Filter by search
  if (searchAddress.value.trim()) {
    filtered = filtered.filter((w) =>
      w.winner.toLowerCase().includes(searchAddress.value.toLowerCase())
    );
  }

  return filtered;
});

const paginatedWinners = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return displayedWinners.value.slice(start, end);
});

const totalPages = computed(() => {
  return Math.ceil(displayedWinners.value.length / itemsPerPage);
});

const hasPersonalWins = computed(() => {
  return filterPersonalWins(winners.value, wallet.usedAddresses).length > 0;
});

// Methods
function getTxExplorerUrl(txId: string): string {
  return `${EXPLORER_URL}en/transactions/${txId}`;
}

function getAddressExplorerUrl(address: string): string {
  return `${EXPLORER_URL}en/addresses/${address}`;
}

function shortenAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
}

function setTab(tab: "all" | "personal" | "leaderboard") {
  activeTab.value = tab;
  currentPage.value = 1; // Reset to first page when switching tabs
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
}

async function loadWinners() {
  try {
    loading.value = true;
    error.value = "";

    console.log("📊 Loading winners dashboard...");

    // Fetch all historical winners
    winners.value = await fetchHistoricalWinners();

    // Calculate statistics
    stats.value = calculateStats(winners.value);

    // Generate leaderboard
    leaderboard.value = generateLeaderboard(winners.value);

    console.log("✅ Winners dashboard loaded:", {
      totalRounds: stats.value.totalRounds,
      uniqueWinners: stats.value.uniqueWinners,
      leaderboardSize: leaderboard.value.length
    });
  } catch (err) {
    console.error("❌ Error loading winners:", err);
    error.value = `Failed to load winners: ${err}`;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadWinners();
});
</script>

<template>
  <div class="winners-dashboard min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8 max-w-7xl">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-5xl md:text-6xl font-extrabold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          🏆 HALL OF CHAMPIONS 🏆
        </h1>
        <p class="text-xl md:text-2xl font-semibold opacity-90">Previous Auction Winners</p>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="alert alert-error shadow-lg mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{{ error }}</span>
      </div>

      <!-- Statistics Cards -->
      <div class="stats stats-vertical lg:stats-horizontal shadow w-full mb-8 bg-base-200">
        <div class="stat">
          <div class="stat-figure text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <div class="stat-title">Total Rounds</div>
          <div v-if="loading" class="stat-value text-primary">
            <span class="loading loading-spinner loading-md"></span>
          </div>
          <div v-else class="stat-value text-primary">{{ stats.totalRounds }}</div>
          <div class="stat-desc">Auctions completed</div>
        </div>

        <div class="stat">
          <div class="stat-figure text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div class="stat-title">Total Volume Traded</div>
          <div v-if="loading" class="stat-value text-secondary">
            <span class="loading loading-spinner loading-md"></span>
          </div>
          <div v-else class="stat-value text-secondary text-sm lg:text-3xl">
            {{ stats.totalCometVolume }} COMET<br />
            <span class="text-xs lg:text-sm">{{ stats.totalErgVolume }} ERG</span>
          </div>
          <div class="stat-desc">All-time volume</div>
        </div>

        <div class="stat">
          <div class="stat-figure text-accent">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <div class="stat-title">Unique Winners</div>
          <div v-if="loading" class="stat-value text-accent">
            <span class="loading loading-spinner loading-md"></span>
          </div>
          <div v-else class="stat-value text-accent">{{ stats.uniqueWinners }}</div>
          <div class="stat-desc">Different addresses</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs tabs-boxed mb-6 bg-base-200 p-2">
        <a
          class="tab"
          :class="{ 'tab-active': activeTab === 'all' }"
          @click="setTab('all')"
        >
          📜 All Winners
        </a>
        <a
          class="tab"
          :class="{ 'tab-active': activeTab === 'personal' }"
          @click="setTab('personal')"
        >
          🎯 My Wins
          <span v-if="hasPersonalWins && !loading" class="badge badge-primary ml-2">
            {{ filterPersonalWins(winners, wallet.usedAddresses).length }}
          </span>
        </a>
        <a
          class="tab"
          :class="{ 'tab-active': activeTab === 'leaderboard' }"
          @click="setTab('leaderboard')"
        >
          🏅 Leaderboard
        </a>
      </div>

      <!-- Search Bar -->
      <div v-if="activeTab !== 'leaderboard'" class="mb-6">
        <div class="form-control">
          <div class="input-group">
            <input
              v-model="searchAddress"
              type="text"
              placeholder="Search by address..."
              class="input input-bordered w-full"
            />
            <button class="btn btn-square" @click="searchAddress = ''">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- All Winners & Personal Wins Table -->
      <div v-if="activeTab !== 'leaderboard'" class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-4">
            {{ activeTab === 'all' ? '📜 All Winners' : '🎯 My Wins' }}
          </h2>

          <!-- Loading State -->
          <div v-if="loading" class="text-center py-12">
            <div class="loading loading-spinner loading-lg mb-4"></div>
            <p class="text-lg">Loading winners from blockchain...</p>
          </div>

          <!-- No Results -->
          <div v-else-if="displayedWinners.length === 0" class="text-center py-12">
            <p class="text-2xl mb-2">🏗️</p>
            <p v-if="activeTab === 'personal'" class="text-lg">
              You haven't won any auctions yet. Keep bidding!
            </p>
            <p v-else class="text-lg">No winners found</p>
          </div>

          <!-- Winners Table -->
          <div v-else class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Winner</th>
                  <th>COMET Won</th>
                  <th>ERG Won</th>
                  <th>Date</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="winner in paginatedWinners" :key="winner.txId">
                  <td class="font-bold">
                    <div class="badge badge-primary">{{ winner.round }}</div>
                  </td>
                  <td>
                    <a
                      :href="getAddressExplorerUrl(winner.winner)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="link link-hover font-mono text-xs md:text-sm"
                      :title="winner.winner"
                    >
                      {{ shortenAddress(winner.winner) }}
                    </a>
                  </td>
                  <td class="font-bold text-primary">{{ winner.cometWon }}</td>
                  <td class="font-bold text-secondary">{{ winner.ergWon }} Ξ</td>
                  <td class="text-sm">{{ winner.timestamp }}</td>
                  <td>
                    <a
                      :href="getTxExplorerUrl(winner.txId)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn btn-xs btn-outline"
                    >
                      View 🔗
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Pagination -->
            <div v-if="totalPages > 1" class="flex justify-center items-center gap-4 mt-6">
              <button
                class="btn btn-sm"
                :disabled="currentPage === 1"
                @click="prevPage"
              >
                « Previous
              </button>
              <span class="text-sm">
                Page {{ currentPage }} of {{ totalPages }}
                <span class="opacity-70">({{ displayedWinners.length }} total)</span>
              </span>
              <button
                class="btn btn-sm"
                :disabled="currentPage === totalPages"
                @click="nextPage"
              >
                Next »
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <div v-else class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-4">🏅 Top Winners Leaderboard</h2>

          <!-- Loading State -->
          <div v-if="loading" class="text-center py-12">
            <div class="loading loading-spinner loading-lg mb-4"></div>
            <p class="text-lg">Calculating leaderboard...</p>
          </div>

          <!-- No Results -->
          <div v-else-if="leaderboard.length === 0" class="text-center py-12">
            <p class="text-2xl mb-2">🏗️</p>
            <p class="text-lg">No leaderboard data available</p>
          </div>

          <!-- Leaderboard Table -->
          <div v-else class="overflow-x-auto">
            <table class="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Winner</th>
                  <th>Total Wins</th>
                  <th>Total COMET</th>
                  <th>Total ERG</th>
                  <th>Last Win</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(entry, index) in leaderboard.slice(0, 50)"
                  :key="entry.address"
                  :class="{ 'bg-warning bg-opacity-20': index < 3 }"
                >
                  <td class="font-bold">
                    <span v-if="index === 0" class="text-2xl">🥇</span>
                    <span v-else-if="index === 1" class="text-2xl">🥈</span>
                    <span v-else-if="index === 2" class="text-2xl">🥉</span>
                    <span v-else>{{ index + 1 }}</span>
                  </td>
                  <td>
                    <a
                      :href="getAddressExplorerUrl(entry.address)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="link link-hover font-mono text-xs md:text-sm"
                      :title="entry.address"
                    >
                      {{ shortenAddress(entry.address) }}
                    </a>
                  </td>
                  <td>
                    <div class="badge badge-primary badge-lg">{{ entry.totalWins }}</div>
                  </td>
                  <td class="font-bold text-primary">{{ entry.totalComet }}</td>
                  <td class="font-bold text-secondary">{{ entry.totalErg }} Ξ</td>
                  <td class="text-sm">{{ entry.lastWinTimestamp }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Info Alert -->
      <div class="alert alert-info mt-8">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <div class="font-bold">Live Data</div>
          <div class="text-sm">
            All data is fetched directly from the Ergo blockchain. Winners are automatically detected from auction distribution transactions.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.winners-dashboard {
  background: linear-gradient(135deg,
    rgba(99, 102, 241, 0.1) 0%,
    rgba(168, 85, 247, 0.1) 50%,
    rgba(236, 72, 153, 0.1) 100%
  );
  background-attachment: fixed;
}
</style>
