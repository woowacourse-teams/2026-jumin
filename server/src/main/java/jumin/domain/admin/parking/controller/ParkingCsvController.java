package jumin.domain.admin.parking.controller;

import jumin.domain.admin.parking.dto.ParkingCsvImportResponse;
import jumin.domain.admin.parking.service.ParkingCsvImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/parking/csv")
public class ParkingCsvController {

    private final ParkingCsvImportService importService;

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ParkingCsvImportResponse> importCsv(@RequestPart("file") MultipartFile file) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(importService.importFile(file));
    }
}
