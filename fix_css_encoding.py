import sys

CSS_FILE = "app/globals.css"

# Read raw bytes
with open(CSS_FILE, "rb") as f:
    raw = f.read()

# Decode up to first invalid UTF-8 byte
valid_bytes = raw[:33394]
text = valid_bytes.decode("utf-8", errors="ignore")

# Strip the dangling partial "/* NUCLEAR RULE..." comment
cut = text.rfind("\n}\n\n/*")
if cut == -1:
    cut = text.rfind("\n}\n\n")
clean = text[:cut + 3]  # keep up to the closing \n

print(f"Clean content length: {len(clean)} chars, ending with: ...{repr(clean[-60:])}")

# All new CSS - ASCII only, no special unicode chars
nuclear_css = """
/* =================================================================
   NUCLEAR MOBILE RULE
   Force ALL multi-col grids to single column on mobile (<768px).
   Covers dash-page, analytics-page, settings-page, profile.
   ================================================================= */
@media (max-width: 768px) {

  /* 1. All 2-col or N-col grids inside page wrappers -> 1 col */
  .dash-page [style*="1fr 1fr"],
  .dash-page [style*="repeat(2"],
  .dash-page [style*="repeat(3"],
  .dash-page [style*="repeat(4"],
  .analytics-page [style*="1fr 1fr"],
  .analytics-page [style*="repeat(2"],
  .analytics-page [style*="repeat(3"],
  .analytics-page [style*="repeat(4"],
  .settings-page [style*="1fr 1fr"],
  .settings-page [style*="repeat(2"],
  .settings-page [style*="repeat(3"],
  .settings-page [style*="repeat(4"],
  .profile-container [style*="1fr 1fr"],
  .profile-container [style*="repeat(2"],
  .profile-container [style*="repeat(3"],
  .profile-container [style*="repeat(4"] {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }

  /* 2. Analytics earnings purple box: stack vertically */
  .analytics-page [style*="background: rgb(124, 58, 237)"],
  .analytics-page [style*="background: #7c3aed"] {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 1rem !important;
  }
  .analytics-page [style*="background: #7c3aed"] > a,
  .analytics-page [style*="background: rgb(124, 58, 237)"] > a {
    width: 100% !important;
    text-align: center !important;
  }

  /* 3. Dashboard header action buttons: stack */
  .dash-header > div:last-child {
    flex-direction: column !important;
    width: 100% !important;
    gap: 0.5rem !important;
  }
  .dash-header > div:last-child > a {
    width: 100% !important;
    text-align: center !important;
  }

  /* 4. Analytics header action link: full width */
  .analytics-header > a {
    width: 100% !important;
    text-align: center !important;
  }

  /* 5. Settings header: stack preview toggle below title */
  .settings-header {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .settings-header > button {
    width: 100% !important;
  }

  /* 6. Question card action row: force wrap */
  .question-card-actions {
    flex-direction: column !important;
    gap: 0.5rem !important;
  }
  .question-card-actions > button,
  .question-card-actions > a {
    width: 100% !important;
  }
}

/* AUTH PAGE: single column on mobile */
@media (max-width: 768px) {
  .auth-page [style*="1fr 1fr"],
  .auth-page [style*="repeat(2"],
  .auth-page [style*="repeat(3"] {
    grid-template-columns: 1fr !important;
    gap: 0.75rem !important;
  }

  /* Auth card: reduce padding on small screens */
  .auth-card { padding: 1.5rem !important; }
  .auth-card-wrap { max-width: 100% !important; }
}
"""

final = clean + nuclear_css

# Write back as pure UTF-8, LF line endings
with open(CSS_FILE, "w", encoding="utf-8", newline="\n") as f:
    f.write(final)

print(f"Done! File written: {len(final)} chars")
print("globals.css is now clean UTF-8.")
