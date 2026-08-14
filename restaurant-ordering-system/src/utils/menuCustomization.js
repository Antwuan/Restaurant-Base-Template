/**
 * Whether an item must go through the customize modal before cart.
 * Required groups or any group with min_select > 0 block quick-add.
 */
export function itemRequiresCustomization(item) {
  const groups = Array.isArray(item?.modifier_groups) ? item.modifier_groups : [];
  return groups.some((g) => {
    if (g?.is_required) return true;
    const min = Number(g?.min_select) || 0;
    return min > 0;
  });
}
