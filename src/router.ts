import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import Dashboard from "./views/DashboardView.vue";
import BondsMarketView from "./views/bonds/BondsMarketView.vue";
import AuctionView from "./views/AuctionView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: AuctionView }, // Set auction as home page
  { path: "/bonds/", name: "bonds", component: BondsMarketView }, // Keep bonds as separate page
  { path: "/dashboard/", name: "dashboard", component: Dashboard }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
