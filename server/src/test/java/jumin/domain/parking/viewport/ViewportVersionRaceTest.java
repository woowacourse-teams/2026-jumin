package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportVersionRaceTest {

    @Test
    @DisplayName("partial hit 뒤 commit과 source 충돌이 나면 이전 hit까지 버리고 새 버전 전체를 조립한다")
    void discards_partial_hit_after_concurrent_commit() throws Exception {
        // given
        ViewportCacheProperties properties = properties();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportVersion oldVersion = new ViewportVersion(UUID.randomUUID(),1,1000,true);
        ViewportVersion newVersion = new ViewportVersion(oldVersion.epoch(),2,1000,true);
        AtomicReference<ViewportVersion> current = new AtomicReference<>(oldVersion);
        when(repository.version(any())).thenAnswer(invocation -> current.get());
        ViewportCell oldHit = new ViewportCell(key(oldVersion,10),List.of(item(1,10)));
        NoViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey,ViewportCell> getMany(List<ViewportCellKey> keys,ViewportDeadline deadline) {
                return keys.contains(oldHit.key()) ? Map.of(oldHit.key(),oldHit) : Map.of();
            }
        };
        CountDownLatch loadingOld = new CountDownLatch(1);
        CompletableFuture<Map<ViewportCellKey,ViewportCell>> oldSource = new CompletableFuture<>();
        AtomicInteger loads = new AtomicInteger();
        when(repository.load(anyList(),any(),any())).thenAnswer(invocation -> {
            ((Runnable)invocation.getArgument(2)).run();
            if (loads.incrementAndGet()==1) {
                loadingOld.countDown();
                return oldSource;
            }
            return CompletableFuture.completedFuture(Map.of(
                    key(newVersion,10),new ViewportCell(key(newVersion,10),List.of(item(1,100))),
                    key(newVersion,20),new ViewportCell(key(newVersion,20),List.of(item(2,200)))));
        });
        try (var executor=Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader=new ViewportCellLoader(store,repository,properties,metrics)) {
            ViewportSearchService service=service(properties,repository,store,loader,metrics);
            var request=CompletableFuture.supplyAsync(() -> service.search(request()),executor);
            assertThat(loadingOld.await(5,TimeUnit.SECONDS)).isTrue();

            // when
            current.set(newVersion);
            oldSource.completeExceptionally(new ViewportVersionChangedException());

            // then
            try (ViewportBody body=request.get(5,TimeUnit.SECONDS)) {
                ParkingLotViewportResponses response=(ParkingLotViewportResponses)body.value();
                assertThat(response.parkingLots()).extracting(row -> row.id()).containsExactly(1L,2L);
                assertThat(response.parkingLots().getFirst().score())
                        .isEqualTo(new ParkingLodScoreCalculator().calculate(100));
                body.complete(true);
            }
            verify(repository,times(2)).version(any());
            verify(repository,times(2)).load(anyList(),any(),any());
            verify(repository,times(0)).fallback(any(),any(),anyInt(),any(),any());
        }
    }

    @Test
    @DisplayName("두 번의 source 버전 충돌 뒤에는 전체 원본 fallback 한 번으로만 응답한다")
    void falls_back_once_after_second_version_conflict() {
        // given
        ViewportCacheProperties properties=properties();
        ViewportReadRepository repository=mock(ViewportReadRepository.class);
        ViewportMetrics metrics=new ViewportMetrics(new SimpleMeterRegistry());
        ViewportVersion version=new ViewportVersion(UUID.randomUUID(),1,1000,true);
        when(repository.version(any())).thenReturn(version);
        when(repository.load(anyList(),any(),any()))
                .thenAnswer(invocation -> CompletableFuture.failedFuture(new ViewportVersionChangedException()));
        ViewportBody fallback=new ViewportBody(ParkingLotViewportResponses.from(List.of()),() -> { });
        when(repository.fallback(any(),any(),anyInt(),any(),any())).thenReturn(CompletableFuture.completedFuture(fallback));
        NoViewportCellStore store=new NoViewportCellStore();
        try (ViewportCellLoader loader=new ViewportCellLoader(store,repository,properties,metrics)) {
            // when
            ViewportBody body=service(properties,repository,store,loader,metrics).search(request());

            // then
            assertThat(body.value()).isEqualTo(fallback.value());
            body.complete(true);
            verify(repository,times(2)).version(any());
            verify(repository,times(2)).load(anyList(),any(),any());
            verify(repository,times(1)).fallback(any(),any(),anyInt(),any(),any());
        }
    }

    private ViewportSearchService service(ViewportCacheProperties properties,ViewportReadRepository repository,
                                          ViewportCellStore store,ViewportCellLoader loader,ViewportMetrics metrics) {
        ViewportCellCover cover=mock(ViewportCellCover.class);
        when(cover.cover(any())).thenReturn(List.of(10L,20L));
        return new ViewportSearchService(properties,mock(ParkingSearchService.class),cover,repository,store,loader,
                metrics,new ParkingLodScoreCalculator(),Clock.fixed(Instant.parse("2026-10-26T00:00:00Z"),ZoneOffset.UTC));
    }

    private ViewportCacheProperties properties() {
        ViewportCacheProperties properties=new ViewportCacheProperties();
        properties.setEnabled(true);
        properties.setEnvironment("race");
        return properties;
    }

    private ViewportCellKey key(ViewportVersion version,long cell) {
        return new ViewportCellKey("race",1,1,version,cell);
    }

    private ViewportItem item(long id,int capacity) {
        return new ViewportItem(id,37.5,127,capacity,false,true,false,false,false);
    }

    private ParkingLotViewportRequest request() {
        return new ParkingLotViewportRequest(126.99,37.49,127.01,37.51,false,false,false);
    }
}
