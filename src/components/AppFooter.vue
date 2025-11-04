<script setup lang="ts">
import { useProgrammatic } from "@oruga-ui/oruga-next";
import { onMounted } from "vue";
import { useUIStore } from "@/stories";
import KYAView from "@/views/KYAView.vue";

const { oruga } = useProgrammatic();

const store = useUIStore();

onMounted(() => {
  if (!store.isKYAAccepted.value) {
    openKYAModal();
  }
});

function openKYAModal() {
  oruga.modal.open({
    component: KYAView,
    canCancel: store.isKYAAccepted.value
  });
}
</script>

<template>
  <footer class="footer p-10 bg-base-300 bg-opacity-50 z-10 text-base-content">
    <div>
      <p class="text-xl font-bold">🔥 COMET DEGEN BID WAR 🔥</p>
      <p class="opacity-70">Last bidder wins 95% of the pot!</p>
      <p class="text-sm opacity-50">Built on Ergo Blockchain</p>
    </div>
    <div>
      <span class="footer-title">Resources</span>
      <a
        href="https://github.com/Koutelier/Comet-Bid-War"
        class="link link-hover"
        target="_blank"
        rel="noopener noreferrer"
        >GitHub</a
      >
      <a class="link link-hover" @click="openKYAModal">Know Your Assumptions</a>
    </div>
    <div>
      <span class="footer-title">Powered By</span>
      <a
        class="link link-hover flex items-center gap-2"
        target="_blank"
        rel="noopener noreferrer"
        href="https://ergoplatform.org"
      >
        <img src="@/assets/nautilus.svg?url" width="24" height="24" />
        Nautilus Wallet
      </a>
      <a
        href="https://ergoplatform.org"
        class="link link-hover"
        target="_blank"
        rel="noopener noreferrer"
        >Ergo Platform</a
      >
    </div>
  </footer>
</template>
