import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import Dashboard from "./views/DashboardView.vue";
import BondsMarketView from "./views/bonds/BondsMarketView.vue";
import AuctionView from "./views/AuctionView.vue";
import BiddingPage from "./views/BiddingPage.vue";
import OwnerAdminPage from "./views/OwnerAdminPage.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: AuctionView }, // Main auction view
  { path: "/bid", name: "bid", component: BiddingPage }, // Simplified bidding page
  { path: "/admin", name: "admin", component: OwnerAdminPage }, // Owner admin page
  { path: "/bonds/", name: "bonds", component: BondsMarketView }, // Keep bonds as separate page
  { path: "/dashboard/", name: "dashboard", component: Dashboard }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
