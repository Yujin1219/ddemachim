export function createObjectUrlOwner({
  createObjectURL = (value) => URL.createObjectURL(value),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
} = {}) {
  let current = null;
  return {
    replace(value) {
      if (current) revokeObjectURL(current);
      current = createObjectURL(value);
      return current;
    },
    clear() {
      if (!current) return;
      const owned = current;
      current = null;
      revokeObjectURL(owned);
    },
    current: () => current,
  };
}
