import sys

path = "scripts/stage_dreamina.js"

old = """    console.log('Uploaded to R2:', filename)
    const finalUrl = `${process.env.R2_PUBLIC_URL}/${filename}`
    await patchSupabase({ status: 'complete', final_url: finalUrl })
    await browser.close()
    process.exit(0)
  }"""

new = """    console.log('Uploaded to R2:', filename)
    const finalUrl = `${process.env.R2_PUBLIC_URL}/${filename}`
    await patchSupabase({ status: 'complete', final_url: finalUrl })

    // Let the page settle so the generated video tile is fully rendered
    // before we try to open its menu.
    await sleep(4000)

    // Delete the just-generated video so the account stays virgin for the
    // next run (avoids stale-URL capture bug on accounts with history).
    try {
      await page.evaluate(() => {
        const btn = document.querySelector('div.operation-button-yvlnnN')
        if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      await sleep(1000)

      await page.evaluate(() => {
        const item = Array.from(document.querySelectorAll('div.dropdown-item-view-xYtTJU'))
          .find(d => d.textContent.trim() === 'Delete')
        if (item) item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      await sleep(1000)

      await page.evaluate(() => {
        const confirmBtn = document.querySelector('button.delete-button-N4O8hV')
        if (confirmBtn) confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      await sleep(1500)

      console.log('Cleanup: deleted generated video, account reset to virgin.')
    } catch (e) {
      console.error('Cleanup delete failed:', e.message)
    }

    await browser.close()
    process.exit(0)
  }"""

with open(path, "r") as f:
    content = f.read()

if old not in content:
    print("ERROR: target block not found — file may have changed. No edits made.")
    sys.exit(1)

if content.count(old) > 1:
    print("ERROR: target block found more than once — refusing to patch ambiguously.")
    sys.exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched successfully:", path)
