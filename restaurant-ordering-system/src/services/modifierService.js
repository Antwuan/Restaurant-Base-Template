import { supabase } from '../config/supabase';

/**
 * Fetch modifier groups + options for many menu items.
 * Returns a map: { [menuItemId]: ModifierGroup[] }
 * where each group includes `options: ModifierOption[]`.
 */
export async function getModifiersByMenuItemIds(menuItemIds = []) {
  const ids = [...new Set((menuItemIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data: groups, error: groupsError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')
    .in('menu_item_id', ids)
    .order('display_order', { ascending: true });

  if (groupsError) throw groupsError;

  const groupIds = (groups || []).map((g) => g.id);
  let options = [];
  if (groupIds.length) {
    const { data: opts, error: optsError } = await supabase
      .from('menu_item_modifier_options')
      .select('*')
      .in('group_id', groupIds)
      .order('display_order', { ascending: true });
    if (optsError) throw optsError;
    options = opts || [];
  }

  const optionsByGroup = options.reduce((acc, opt) => {
    if (!acc[opt.group_id]) acc[opt.group_id] = [];
    acc[opt.group_id].push(opt);
    return acc;
  }, {});

  const byItem = {};
  for (const id of ids) byItem[id] = [];

  for (const group of groups || []) {
    const itemId = group.menu_item_id;
    if (!byItem[itemId]) byItem[itemId] = [];
    byItem[itemId].push({
      ...group,
      options: optionsByGroup[group.id] || [],
    });
  }

  return byItem;
}

export async function getModifiersForItem(menuItemId) {
  if (!menuItemId) return [];
  const map = await getModifiersByMenuItemIds([menuItemId]);
  return map[menuItemId] || [];
}

/**
 * Replace all modifier groups/options for an item.
 * `groups` shape:
 *   [{
 *     id?, name, selection_type, min_select, max_select, is_required, display_order,
 *     options: [{ id?, name, price_delta, is_default, is_available, display_order }]
 *   }]
 */
export async function replaceItemModifiers(menuItemId, groups = []) {
  if (!menuItemId) throw new Error('menuItemId is required');

  // Delete existing groups (options cascade)
  const { error: deleteError } = await supabase
    .from('menu_item_modifier_groups')
    .delete()
    .eq('menu_item_id', menuItemId);

  if (deleteError) throw deleteError;

  if (!groups.length) return [];

  const inserted = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const name = (g.name || '').trim();
    if (!name) continue;

    const selectionType = g.selection_type === 'multi' ? 'multi' : 'single';
    const isRequired = !!g.is_required;
    let minSelect = Number.isFinite(g.min_select) ? g.min_select : (isRequired ? 1 : 0);
    let maxSelect = Number.isFinite(g.max_select)
      ? g.max_select
      : (selectionType === 'single' ? 1 : Math.max(1, (g.options || []).length || 1));

    if (selectionType === 'single') {
      maxSelect = 1;
      if (isRequired) minSelect = Math.max(minSelect, 1);
    }

    const { data: groupRow, error: groupError } = await supabase
      .from('menu_item_modifier_groups')
      .insert({
        menu_item_id: menuItemId,
        name,
        selection_type: selectionType,
        min_select: minSelect,
        max_select: maxSelect,
        is_required: isRequired,
        display_order: g.display_order ?? gi,
      })
      .select()
      .single();

    if (groupError) throw groupError;

    const opts = (g.options || [])
      .map((o, oi) => ({
        group_id: groupRow.id,
        name: (o.name || '').trim(),
        price_delta: Number(o.price_delta) || 0,
        is_default: !!o.is_default,
        is_available: o.is_available !== false,
        display_order: o.display_order ?? oi,
      }))
      .filter((o) => o.name);

    let optionRows = [];
    if (opts.length) {
      const { data, error: optError } = await supabase
        .from('menu_item_modifier_options')
        .insert(opts)
        .select();
      if (optError) throw optError;
      optionRows = data || [];
    }

    inserted.push({ ...groupRow, options: optionRows });
  }

  return inserted;
}
