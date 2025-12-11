export const TOOL_METADATA = {
  // READ-ONLY (L0)
  'briefs.read': { autonomy: 'L0', kind: 'read' },
  'analytics.summary.read': { autonomy: 'L0', kind: 'read' },
  'google_ads.read': { autonomy: 'L0', kind: 'read' },
  'ga4.read': { autonomy: 'L0', kind: 'read' },
  'bq.read': { autonomy: 'L0', kind: 'read' },
  'stripe.read': { autonomy: 'L0', kind: 'read' },
  'infra.status.read': { autonomy: 'L0', kind: 'read' },
  'devops.status.read': { autonomy: 'L0', kind: 'read' },

  // WRITE – INTERNAL (L1)
  'briefs.write': { autonomy: 'L1', kind: 'write_internal' },
  'ppc_plan.write': { autonomy: 'L1', kind: 'write_internal' },
  'ppc_changes.write': { autonomy: 'L1', kind: 'write_internal' },
  'analytics.snapshots.write': { autonomy: 'L1', kind: 'write_internal' },
  'insights.write': { autonomy: 'L1', kind: 'write_internal' },
  'creative_packages.write': { autonomy: 'L1', kind: 'write_internal' },
  'asset_library.write': { autonomy: 'L1', kind: 'write_internal' },
  'incidents.write': { autonomy: 'L1', kind: 'write_internal' },

  // APPLY / SIDE-EFFECT (L2)
  'google_ads.write.apply': { autonomy: 'L2', kind: 'apply_external' },
};

export function toolMetadataFor(name) {
  return TOOL_METADATA[name] || { autonomy: 'L0', kind: 'read' };
}

export default { TOOL_METADATA, toolMetadataFor };
