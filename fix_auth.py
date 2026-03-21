from playwright.sync_api import sync_playwright
import os

profile_dir = os.path.expanduser("~/.notebooklm/browser_profile")
state_path = os.path.expanduser("~/.notebooklm/storage_state.json")

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=profile_dir,
        headless=True
    )
    context.storage_state(path=state_path)
    context.close()
    print("Storage state saved successfully to", state_path)
