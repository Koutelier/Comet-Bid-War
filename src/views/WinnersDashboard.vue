<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useChainStore } from "@/stories";

const chain = useChainStore();
const loading = ref(true);

// Placeholder for historical winners
// TODO: Query blockchain for past AuctionAutoDistribute transactions
const winners = ref<Array<{
  round: number;
  winner: string;
  cometWon: string;
  ergWon: string;
  timestamp: string;
  txId: string;
}>>([]);

onMounted(async () => {
  loading.value = false;
  // TODO: Implement blockchain query for historical winners
  // This would query for transactions that spent from the auction contract
  // and extract winner addresses and amounts from the outputs
});
</script>

<template>
  <div class="winners-dashboard min-h-screen bg-base-100">
    <div class="container mx-auto px-4 py-8 max-w-6xl">
      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="text-6xl font-extrabold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          🏆 HALL OF CHAMPIONS 🏆
        </h1>
        <p class="text-2xl font-semibold opacity-90">Previous Auction Winners</p>
      </div>

      <!-- Coming Soon Message -->
      <div class="card bg-gradient-to-br from-primary to-secondary text-primary-content shadow-2xl mb-8">
        <div class="card-body text-center">
          <h2 class="card-title justify-center text-3xl mb-4">🚧 Under Construction 🚧</h2>
          <p class="text-xl">
            The winners dashboard is being built! Soon you'll be able to see:
          </p>
          <ul class="text-left text-lg mt-4 space-y-2 max-w-2xl mx-auto">
            <li>✅ Complete history of all auction rounds</li>
            <li>✅ Winner addresses and amounts won</li>
            <li>✅ Total volume traded</li>
            <li>✅ Biggest winners (leaderboard)</li>
            <li>✅ Your personal win history</li>
            <li>✅ Links to explorer for each transaction</li>
          </ul>
        </div>
      </div>

      <!-- Placeholder Stats -->
      <div class="stats stats-vertical lg:stats-horizontal shadow w-full mb-8">
        <div class="stat">
          <div class="stat-figure text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <div class="stat-title">Total Rounds</div>
          <div class="stat-value text-primary">---</div>
          <div class="stat-desc">Coming soon</div>
        </div>

        <div class="stat">
          <div class="stat-figure text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
          </div>
          <div class="stat-title">Total Volume</div>
          <div class="stat-value text-secondary">---</div>
          <div class="stat-desc">Coming soon</div>
        </div>

        <div class="stat">
          <div class="stat-figure text-accent">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path></svg>
          </div>
          <div class="stat-title">Unique Winners</div>
          <div class="stat-value text-accent">---</div>
          <div class="stat-desc">Coming soon</div>
        </div>
      </div>

      <!-- Placeholder Table -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-2xl mb-4">📜 Recent Winners</h2>

          <div class="overflow-x-auto">
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
                <tr>
                  <td colspan="6" class="text-center py-12">
                    <div class="text-lg opacity-70">
                      <div class="loading loading-spinner loading-lg mb-4" v-if="loading"></div>
                      <div v-else>
                        <p class="text-2xl mb-2">🏗️</p>
                        <p>No winners yet - be the first!</p>
                        <p class="text-sm mt-2">Winners will appear here after auction rounds complete</p>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Technical Note -->
      <div class="alert alert-info mt-8">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <div>
          <div class="font-bold">Developer Note</div>
          <div class="text-sm">
            This dashboard will query the Ergo blockchain for historical auction distribution transactions.
            It will track all winners, amounts, and provide detailed statistics.
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
