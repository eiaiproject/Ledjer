<script setup lang="ts">
import type { DefaultTheme } from "vitepress/theme";
import { computed } from "vue";
import { useData } from "vitepress";
import VPFeature from "./VPFeature.vue";

export interface Feature {
  icon?: DefaultTheme.FeatureIcon;
  title: string;
  details: string;
  link?: string;
  linkText?: string;
  rel?: string;
  target?: string;
}

const props = defineProps<{
  features: Feature[];
}>();

const { frontmatter } = useData();

/** Optional section header rendered from frontmatter.featuresSection. */
const section = computed<{ eyebrow?: string; title?: string; description?: string } | null>(() => {
  const s = (frontmatter.value as Record<string, unknown>).featuresSection;
  return s && typeof s === "object" ? (s as { eyebrow?: string; title?: string; description?: string }) : null;
});

const grid = computed(() => {
  const length = props.features.length;

  if (!length) {
    return;
  } else if (length === 2) {
    return "grid-2";
  } else if (length === 3) {
    return "grid-3";
  } else if (length % 3 === 0) {
    return "grid-6";
  } else if (length > 3) {
    return "grid-4";
  }
});
</script>

<template>
  <section v-if="features" class="VPFeatures" :aria-labelledby="section?.title ? 'features-title' : undefined">
    <div class="container">
      <div v-if="section?.title" class="features-header">
        <p v-if="section.eyebrow" class="features-eyebrow">{{ section.eyebrow }}</p>
        <h2 id="features-title" class="features-title">{{ section.title }}</h2>
        <p v-if="section.description" class="features-description">{{ section.description }}</p>
      </div>
      <div class="items">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="item"
          :class="[grid]"
        >
          <VPFeature
            :icon="feature.icon"
            :title="feature.title"
            :details="feature.details"
            :link="feature.link"
            :link-text="feature.linkText"
            :rel="feature.rel"
            :target="feature.target"
          />
        </div>
      </div>
    </div>
  </section>
</template>
