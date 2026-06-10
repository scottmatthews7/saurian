import { TOOLS } from "./config.js";

// Backpack inventory state (no rendering — the HUD reads this, tools.js shows the
// equipped mesh in-hand). A fixed-size list of slots; each slot is either empty
// (null) or holds { kind, count }. The active slot is the EQUIPPED weapon: its
// kind drives the in-hand mesh and the strike damage/range modifier.
//
// Bare-handed is slot -1 (no weapon): the unarmed punch/kick fallback. Number
// keys 1..N select slots; selecting the equipped slot again, or 0, unequips.

/**
 * Create the player's backpack inventory.
 *
 * @returns {object} inventory state with add/select/equipped/consume helpers.
 */
export function createInventory() {
  const slots = new Array(TOOLS.backpackSlots).fill(null);

  const state = {
    slots,
    active: -1,          // index of the equipped slot, or -1 for bare-handed
    onChange: null,      // fired whenever slots/active change (HUD re-render hook)

    // Pick up a weapon of `kind`. Stacks onto an existing slot of the same kind
    // (rocks especially come in numbers), else fills the first empty slot.
    // Auto-equips the first weapon picked up so it lands in-hand immediately.
    // Returns true if it fit, false if the backpack is full.
    add(kind) {
      const existing = slots.findIndex((s) => s && s.kind === kind);
      if (existing >= 0) {
        slots[existing].count += 1;
        if (state.active < 0) state.active = existing;
        state.changed();
        return true;
      }
      const empty = slots.indexOf(null);
      if (empty < 0) return false;
      slots[empty] = { kind, count: 1 };
      if (state.active < 0) state.active = empty;
      state.changed();
      return true;
    },

    // Select a slot by index (0-based). Re-selecting the equipped slot unequips
    // (back to bare hands); an empty slot is ignored.
    select(index) {
      if (index < 0 || index >= slots.length) return;
      if (!slots[index]) return;
      state.active = state.active === index ? -1 : index;
      state.changed();
    },

    // Bare hands.
    unequip() { state.active = -1; state.changed(); },

    // The equipped weapon kind, or null when bare-handed.
    equippedKind() {
      const s = state.active >= 0 ? slots[state.active] : null;
      return s ? s.kind : null;
    },

    // The equipped weapon's config (damage/range/stagger/…), or null bare-handed.
    equipped() {
      const k = state.equippedKind();
      return k ? TOOLS.kinds[k] : null;
    },

    // Spend one of the equipped weapon (a thrown rock). Empties + removes the
    // slot when the last is used, and unequips if that was the active slot.
    consumeEquipped() {
      if (state.active < 0) return;
      const s = slots[state.active];
      if (!s) return;
      s.count -= 1;
      if (s.count <= 0) {
        slots[state.active] = null;
        // Drop to bare hands rather than silently jumping to another weapon.
        state.active = -1;
      }
      state.changed();
    },

    changed() { if (state.onChange) state.onChange(state); },

    reset() {
      slots.fill(null);
      state.active = -1;
      state.changed();
    },
  };

  return state;
}
