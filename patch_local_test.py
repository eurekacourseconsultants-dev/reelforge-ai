#!/usr/bin/env python3
"""
patch_local_test.py — adds local-test wiring to app/page.js
Run from project root: python3 patch_local_test.py
"""
import sys

PATH = "app/page.js"

with open(PATH, "r") as f:
    content = f.read()

orig = content

# --- Patch 1: new state hooks ---
anchor1 = "  const [demoVariables, setDemoVariables] = useState({})\n"
patch1 = anchor1 + (
    "\n"
    "  const [localTestLoading, setLocalTestLoading] = useState(false)\n"
    "  const [localTestUrl, setLocalTestUrl]         = useState(null)\n"
    "  const [localTestError, setLocalTestError]     = useState(null)\n"
    "  const [localTestLog, setLocalTestLog]         = useState(null)\n"
)
if content.count(anchor1) != 1:
    print(f"ABORT: anchor1 found {content.count(anchor1)} times, expected 1")
    sys.exit(1)
content = content.replace(anchor1, patch1)

# --- Patch 2: new handleTestLocal function, inserted after handleForge's closing brace ---
anchor2 = (
    "      setJobId(data.job_id)\n"
    "      poll(data.job_id)\n"
    "    } catch (err) {\n"
    "      setError(err.message)\n"
    "      setLoading(false)\n"
    "    }\n"
    "  }\n"
)
patch2 = anchor2 + (
    "\n"
    "  async function handleTestLocal() {\n"
    "    setLocalTestLoading(true)\n"
    "    setLocalTestError(null)\n"
    "    setLocalTestUrl(null)\n"
    "    setLocalTestLog(null)\n"
    "    try {\n"
    "      const res = await fetch('/api/run-demo-local', {\n"
    "        method: 'POST',\n"
    "        headers: { 'Content-Type': 'application/json' },\n"
    "        body: JSON.stringify({ demo_type: demoType, variables: demoVariables }),\n"
    "      })\n"
    "      const data = await res.json()\n"
    "      if (data.error) throw new Error(data.error)\n"
    "      setLocalTestUrl(data.preview_url)\n"
    "      setLocalTestLog(data.actions_log)\n"
    "    } catch (err) {\n"
    "      setLocalTestError(err.message)\n"
    "    } finally {\n"
    "      setLocalTestLoading(false)\n"
    "    }\n"
    "  }\n"
)
if content.count(anchor2) != 1:
    print(f"ABORT: anchor2 found {content.count(anchor2)} times, expected 1")
    sys.exit(1)
content = content.replace(anchor2, patch2)

# --- Patch 3: replace the single Generate Demo button with dual button + preview ---
anchor3 = (
    "                      <button\n"
    "                        style={{ ...S.button, opacity: DEMO_FORM_SCHEMAS[demoType].every(f => !f.required || demoVariables[f.id]) ? 1 : 0.5 }}\n"
    "                        onClick={handleForge}\n"
    "                        disabled={loading || !DEMO_FORM_SCHEMAS[demoType].every(f => !f.required || demoVariables[f.id])}\n"
    "                      >\n"
    "                        {loading ? 'Generating Demo...' : 'Generate Demo'}\n"
    "                      </button>\n"
)
patch3 = (
    "                      {(() => {\n"
    "                        const formValid = DEMO_FORM_SCHEMAS[demoType].every(f => !f.required || demoVariables[f.id])\n"
    "                        return (\n"
    "                          <>\n"
    "                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>\n"
    "                              <button\n"
    "                                style={{ ...S.button, flex: 1, background: C.surface, color: C.accent, border: `2px solid ${C.accent}`, opacity: formValid ? 1 : 0.5 }}\n"
    "                                onClick={handleTestLocal}\n"
    "                                disabled={localTestLoading || !formValid}\n"
    "                              >\n"
    "                                {localTestLoading ? 'Running locally...' : '\\ud83e\\uddea Test Locally'}\n"
    "                              </button>\n"
    "                              <button\n"
    "                                style={{ ...S.button, flex: 1, opacity: formValid ? 1 : 0.5 }}\n"
    "                                onClick={handleForge}\n"
    "                                disabled={loading || !formValid}\n"
    "                              >\n"
    "                                {loading ? 'Generating Demo...' : 'Generate Demo'}\n"
    "                              </button>\n"
    "                            </div>\n"
    "\n"
    "                            {localTestError && (\n"
    "                              <div style={{ color: C.error, fontSize: '13px', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>\n"
    "                                {localTestError}\n"
    "                              </div>\n"
    "                            )}\n"
    "\n"
    "                            {localTestUrl && (\n"
    "                              <div style={{ marginBottom: '20px' }}>\n"
    "                                <div style={{ ...S.fieldLabel, marginBottom: '8px' }}>Local test result:</div>\n"
    "                                <video\n"
    "                                  src={localTestUrl}\n"
    "                                  controls\n"
    "                                  style={{ width: '100%', borderRadius: '8px', border: `1px solid ${C.border}` }}\n"
    "                                />\n"
    "                              </div>\n"
    "                            )}\n"
    "                          </>\n"
    "                        )\n"
    "                      })()}\n"
)
if content.count(anchor3) != 1:
    print(f"ABORT: anchor3 found {content.count(anchor3)} times, expected 1")
    sys.exit(1)
content = content.replace(anchor3, patch3)

with open(PATH, "w") as f:
    f.write(content)

print("Patched app/page.js successfully (3 changes applied).")
print(f"Backup the original diff with: git diff {PATH}")
