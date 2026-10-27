# Local Android persistence fixes

Based on the published `tauri-plugin-notification` 2.4.0 crate from the Tauri project, under its original Apache-2.0 OR MIT license. Rust, desktop, iOS and frontend behavior are unchanged; imported sources have trailing whitespace cleaned. Kept locally through Cargo's `[patch.crates-io]`; no global Cargo registry files are modified.

Android changes:

- Prepare notification source JSON before scheduling, so tapping the notification retains its original payload.
- Persist scheduled notifications in both the single and batch paths.
- Serialize the actual notification instead of storing a null `sourceJson`; omit the derived source field to avoid recursive growth.
- Reattach source JSON after reading saved plans, ignore damaged/null entries, and catch deserialization errors. This supports pending queries, cancellation and boot restoration.
- Preserve `allowWhileIdle` when serializing all schedule variants.
- Keep custom `extra` fields in a JSON map; typed Jackson deserialization of the SDK's `JSObject` subclass otherwise discarded the subject ID before saving or opening a notification.

The first Android beta was verified with scheduled notifications in an Android emulator. Physical-device battery management still needs separate validation. Recheck these fixes when upgrading the upstream plugin, then remove this patch when equivalent fixes are available upstream.
