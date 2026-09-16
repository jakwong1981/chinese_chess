package com.xiangqi.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Serves public/index.html at "/" — the welcome page (the Node mock maps "/" the same way).
 * Needed because spring.web.resources.add-mappings=false disables Boot's built-in
 * welcome-page handling, which our custom resource handlers replace.
 */
@Controller
public class IndexController {

    private final Path staticRoot;

    public IndexController(@Value("${xiangqi.static-root:..}") String staticRoot) {
        this.staticRoot = resolveStaticRoot(staticRoot);
    }

    private static Path resolveStaticRoot(String configured) {
        List<Path> candidates = List.of(
                Path.of(configured), Path.of(".."), Path.of("."), Path.of("../.."));
        for (Path c : candidates) {
            Path abs = c.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs.resolve("public/index.html"))) return abs;
        }
        return Path.of(configured).toAbsolutePath().normalize();
    }

    @GetMapping("/")
    public ResponseEntity<Resource> index() {
        Resource index = new FileSystemResource(staticRoot.resolve("public/index.html"));
        if (!index.exists()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_HTML)
                .cacheControl(CacheControl.noCache().cachePublic())
                .body(index);
    }
}
