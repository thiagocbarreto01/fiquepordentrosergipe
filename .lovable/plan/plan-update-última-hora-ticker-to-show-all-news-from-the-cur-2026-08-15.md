# Plan: Update "Última Hora" ticker to show all news from the current day

The user wants the "Última Hora" (Breaking Bar) ticker to always display news posted today, instead of just news from the last 90 minutes or items marked as urgent.

## Changes

### Frontend

- **Modify `src/components/site/BreakingBar.tsx`**
  - Update the fetching logic to retrieve all published news from the current day (starting at 00:00:00 UTC, or local time if preferred).
  - Remove the requirement for `is_urgent` if the goal is to show *all* news from today.
  - Ensure the query fetches a sufficient number of items (increasing the limit from 15 to something like 30 to account for busy news days).
  - Update the `since` date calculation to point to the start of the current day.

## Technical Details

- **Date Filtering**: Use `new Date().setHours(0,0,0,0)` to get the start of the current day in the user's local time (or UTC as per standard project practices).
- **Query**:
  ```typescript
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();
  // ... select ...
  // .eq('status', 'published') // already handled by posts_public view
  // .gte('published_at', since)
  // .order('published_at', { ascending: false })
  ```

## Verification Plan

- **Manual Verification**: Check the preview and observe the ticker content. Verify that it contains news published today.
- **Code Audit**: Confirm that the logic correctly identifies the "current day" and fetches all published posts from that timeframe.
