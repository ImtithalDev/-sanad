// Exact copy of the private extractJson() function from lib/ai/service.ts,
// tested in isolation since the parent file imports zod (not installed here).
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

// Case 1: model obeys instructions, returns raw JSON
const raw = '{"description":"Design and development of a website"}';
assert(JSON.parse(extractJson(raw)).description === "Design and development of a website", "raw JSON parses correctly with no fence");

// Case 2: model wraps in a ```json fence despite instructions
const fenced = "```json\n{\"description\":\"Design work\"}\n```";
assert(JSON.parse(extractJson(fenced)).description === "Design work", "fenced JSON is correctly unwrapped and parsed");

// Case 3: model adds commentary before/after — extractJson only strips the fence,
// so this case SHOULD still fail to parse, and the route must treat that as
// AIMalformedResponseError rather than crash. This documents current behavior.
const withCommentary = 'Sure, here is the JSON:\n{"description":"x"}';
let threwOnCommentary = false;
try { JSON.parse(extractJson(withCommentary)); } catch { threwOnCommentary = true; }
assert(threwOnCommentary, "unfenced commentary + JSON correctly fails to parse (caught as malformed, not silently accepted)");

// Case 4: genuinely malformed JSON (truncated) must throw, not silently return partial data
const truncated = '{"description": "incomplete';
let threwOnTruncated = false;
try { JSON.parse(extractJson(truncated)); } catch { threwOnTruncated = true; }
assert(threwOnTruncated, "truncated JSON correctly fails to parse");

// Case 5: empty string
let threwOnEmpty = false;
try { JSON.parse(extractJson("")); } catch { threwOnEmpty = true; }
assert(threwOnEmpty, "empty response correctly fails to parse");

console.log(failures === 0 ? '\nALL EXTRACT-JSON TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
