export * from "./brand-core";
export * from "./dates";
export * from "./commercial";
export * from "./arabic-copywriter";
export * from "./background-provider";
export * from "./overlay-system";
export * from "./quality-gate";
export * from "./production-engine";
export * from "./i18n";
export * from "./studio-fields";
export * from "./svg-utils";
export * from "./product-visual-brief";
export {
  assertZonesDoNotOverlap,
  createAdZones,
  fitText,
  type AdZones,
  type FittedText,
  type Rect,
  type TextDirection as LayoutTextDirection,
} from "./layout-geometry";
export {
  buildDesignPromptBlock,
  commercialBadgeAnchors,
  commercialBadgeYForSize,
  contextMoodDirective,
  creativeSlotRecipe,
  headlinePlanForSlot,
  textDirectionDirective,
  visualBriefDirective,
  CREATIVE_SLOT_RECIPES,
  DESIGN_LAYOUT,
  DESIGN_RULE_IDS,
  DESIGN_RULE_IDS_BY_SLOT,
  DESIGN_RULE_LIST,
  DESIGN_RULES,
  type CommercialBadgeAnchors,
  type CreativeSlot,
  type CreativeSlotId,
  type CreativeSlotRecipe,
  type DesignContext,
  type DesignHeadlineInput,
  type DesignHeadlinePlan,
  type DesignPromptOptions,
  type DesignRule,
  type DesignRuleId,
} from "./design-library";
