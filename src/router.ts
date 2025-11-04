import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import Dashboard from "./views/DashboardView.vue";
import BondsMarketView from "./views/bonds/BondsMarketView.vue";
import AuctionView from "./views/AuctionView.vue";
import BiddingPage from "./views/BiddingPage.vue";
import OwnerAdminPage from "./views/OwnerAdminPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: BiddingPage }, // Main bidding page
  { path: "/bid", name: "bid", component: BiddingPage }, // Alias for bidding page
  { path: "/auction", name: "auction", component: AuctionView }, // Full auction view
  { path: "/admin", name: "admin", component: OwnerAdminPage }, // Owner admin page
  { path: "/bonds/", name: "bonds", component: BondsMarketView }, // Keep bonds as separate page
  { path: "/dashboard/", name: "dashboard", component: Dashboard }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
