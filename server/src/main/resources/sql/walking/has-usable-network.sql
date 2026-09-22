-- pgRouting 확장, 완료된 적재 메타데이터, 그리고 실제 보행망 데이터가 모두 있는지 확인한다.
SELECT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pgrouting'
)
AND EXISTS (
    SELECT 1
    FROM walking_network_metadata metadata
    WHERE metadata.id = 1
      AND metadata.status = 'READY'
      AND metadata.node_count > 0
      AND metadata.edge_count > 0
)
AND EXISTS (
    SELECT 1
    FROM walking_nodes
)
AND EXISTS (
    SELECT 1
    FROM walking_edges
    WHERE walkable = true
)
