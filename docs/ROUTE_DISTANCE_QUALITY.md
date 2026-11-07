# Route distance quality

The route endpoint returns a `distanceQuality` object alongside the shortest-path result.

Statuses:
- `verified`: every route edge declares `architectural_plan` or `field_measured` evidence.
- `estimated`: at least one route edge is marked `admin_estimate`, and no edge is missing evidence.
- `unverified`: one or more legacy route edges have no evidence record.
- `not_applicable`: the origin and destination are the same node, so the route has no edges.

The response includes edge counts and a user-facing message. The directions drawer surfaces a warning whenever the route contains estimates or unverified legacy distances. This prevents the existing graph's provisional edge values from being presented as fully measured navigation distances.

The shortest-path algorithm still uses stored edge weights so existing routes continue to work. The quality flag communicates the limits of those weights; it does not itself improve physical accuracy.
