package jumin.domain.destination.controller;

import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.service.DestinationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/destinations")
public class DestinationController {

    private final DestinationService destinationService;

    @GetMapping("/search")
    public ResponseEntity<DestinationsResponse> search(
            @RequestParam(value = "query", required = false) String query
    ) {
        return ResponseEntity.ok(destinationService.search(query));
    }
}
