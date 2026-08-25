export async function importPublicCourseForCreation({
  course,
  addPlace,
  onPlaceAdded,
  onBasketRefresh,
  onCreateCourse,
  signal,
}) {
  const importedItems = [];
  for (const place of course.places) {
    const basketItem = await addPlace(place.name, signal);
    importedItems.push(basketItem);
    onPlaceAdded?.(basketItem);
  }
  if (signal?.aborted) return importedItems;
  onBasketRefresh?.();
  onCreateCourse?.(importedItems);
  return importedItems;
}
