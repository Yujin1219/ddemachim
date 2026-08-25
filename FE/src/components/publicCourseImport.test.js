import assert from 'node:assert/strict';
import test from 'node:test';
import { importPublicCourseForCreation } from './publicCourseImport.js';

test('starts course creation with only the places imported from the selected public course', async () => {
  const addedItems = [];
  const creationSelections = [];
  let refreshCount = 0;
  const course = {
    places: [
      { name: '창덕궁', category: '궁궐' },
      { name: '북촌한옥마을', category: '산책' },
    ],
  };

  const imported = await importPublicCourseForCreation({
    course,
    addPlace: async (placeName) => ({ id: placeName === '창덕궁' ? 31 : 32, placeName }),
    onPlaceAdded: (item) => addedItems.push(item.id),
    onBasketRefresh: () => { refreshCount += 1; },
    onCreateCourse: (items) => creationSelections.push(items.map((item) => item.id)),
  });

  assert.deepEqual(imported.map((item) => item.id), [31, 32]);
  assert.deepEqual(addedItems, [31, 32]);
  assert.equal(refreshCount, 1);
  assert.deepEqual(creationSelections, [[31, 32]]);
});
