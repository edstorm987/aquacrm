import "server-only";

import { randomUUID } from "node:crypto";
import { newTelemetrySiteKey } from "@/lib/server/clientTelemetry";
import {
  PORTAL_PRODUCT_CATALOG,
  cleanPortalProducts,
  type PortalProductKey,
} from "@/lib/portalProducts";

const PLAN_LABELS: Record<string, string> = {
  foundational: "Foundational Flow",
  expansion: "Expansion Plan",
  mastery: "Mastery Plan",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function customerPortalProvisioningMetadata(input: {
  clientName: string;
  contactName?: string;
  email?: string;
  servicePlan?: string;
  welcomeNote?: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const plan = text(input.servicePlan);
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const contactName = text(input.contactName) || input.clientName;

  return {
    portalMode: "onboarding" as const,
    portalLoginEmail: text(input.email).toLowerCase(),
    portalContactName: contactName,
    portalServicePlan: planLabel || "Milesymedia custom plan",
    portalWelcomeNote: text(input.welcomeNote)
      || `Welcome to your Milesymedia home. This is where ${input.clientName}'s project, files, billing, and support will stay together.`,
    portalBuiltAt: now,
    portalShellVersion: "stunning-standard-v1",
    portalAccessUpdatedAt: now,
    telemetrySiteKey: newTelemetrySiteKey(),
    telemetryEvents: [],
  };
}

const CODE_PRODUCT_KINDS: Partial<Record<PortalProductKey, "website" | "client-portal">> = {
  website: "website",
  "custom-software": "client-portal",
  "business-os": "client-portal",
};

export function clientDeliveryPackageMetadata(input: {
  clientName: string;
  servicePlan?: string;
  products?: unknown;
  productKeys?: unknown;
  projectValue?: string;
  billingCadence?: string;
  existingProperties?: unknown;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const productKeys = Array.isArray(input.productKeys)
    ? input.productKeys.filter((value): value is PortalProductKey =>
      typeof value === "string" && PORTAL_PRODUCT_CATALOG.some(product => product.catalogKey === value),
    )
    : [];
  const suppliedProducts = cleanPortalProducts(input.products);
  const products = suppliedProducts.length
    ? suppliedProducts
    : cleanPortalProducts(productKeys.map(key => {
      const definition = PORTAL_PRODUCT_CATALOG.find(product => product.catalogKey === key);
      return definition ? { ...definition, id: definition.catalogKey } : null;
    }).filter(Boolean));
  const existingProperties = Array.isArray(input.existingProperties)
    ? input.existingProperties.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    : [];
  const plannedProperties = products.flatMap(product => {
    if (!product.catalogKey) return [];
    const kind = CODE_PRODUCT_KINDS[product.catalogKey];
    if (!kind) return [];
    const label = product.catalogKey === "website"
      ? `${input.clientName} website`
      : `${input.clientName} ${product.name.toLowerCase()}`;
    const alreadyExists = existingProperties.some(property =>
      property.kind === kind && typeof property.label === "string"
      && property.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (alreadyExists) return [];
    return [{
      id: `prop_${randomUUID()}`,
      label,
      kind,
      status: "planning",
      repositoryStatus: "not-created",
      deploymentStatus: "not-deployed",
      tagStatus: "planned",
      notes: `Planned automatically from the agreed ${product.name.toLowerCase()} service.`,
      updatedAt: now,
    }];
  });
  const planIncludes = [...new Set(products.flatMap(product => product.deliverables))];
  const servicePlan = text(input.servicePlan) || "Milesymedia custom plan";
  const projectValue = text(input.projectValue);
  const billingCadence = text(input.billingCadence) || "As agreed";
  const productNames = products.map(product => product.name);

  return {
    portalServicePlan: servicePlan,
    portalPlanSummary: productNames.length
      ? `${productNames.join(", ")} delivered through one clear AquaCRM workspace.`
      : "A tailored Milesymedia service delivered through one clear workspace.",
    portalPlanIncludes: planIncludes,
    portalProducts: products,
    portalBillingCadence: billingCadence,
    agreedProjectValue: projectValue || undefined,
    properties: [...existingProperties, ...plannedProperties],
    deliveryPackageCreatedAt: now,
  };
}
