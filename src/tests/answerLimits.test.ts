import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswer } from '../utils/helpers';
import { runGameLogicTests } from './gameLogic.test';

test('ten words are accepted, including mixed whitespace; eleven are rejected', () => {
  const ten = 'one two three four five six seven eight nine ten';
  assert.equal(validateAnswer(ten).isValid, true);
  assert.equal(validateAnswer(ten.replaceAll(' ', '\t\n')).wordCount, 10);
  assert.equal(validateAnswer(ten.replaceAll(' ', '\t\n')).isValid, true);
  assert.match(validateAnswer(ten + ' eleven').error!, /maximum 10 words/);
});

test('empty answers and the existing 120-character cap remain enforced', () => {
  assert.equal(validateAnswer(' \n ').isValid, false);
  assert.equal(validateAnswer('a'.repeat(120)).isValid, true);
  assert.equal(validateAnswer('a'.repeat(121)).isValid, false);
});

test('the developer rule checks agree with the public answer limit', () => {
  assert.deepEqual(runGameLogicTests().filter(result => !result.passed), []);
});
