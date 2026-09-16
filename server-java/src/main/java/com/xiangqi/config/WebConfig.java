package com.xiangqi.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Static file serving + CORS, mirroring server/index.js:
 * - "/" serves public/index.html (welcome page)
 * - "/**" serves files from {static-root}/public/
 * - "/shared/**" serves files from {static-root}/shared/
 * - /api/** responses carry Access-Control-Allow-Origin: * with OPTIONS preflight
 * - static responses are no-cache (dev parity with the Node mock)
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final Path staticRoot;

    public WebConfig(@Value("${xiangqi.static-root:..}") String staticRoot) {
        this.staticRoot = resolveStaticRoot(staticRoot);
    }

    /** Pick the first candidate root that actually contains public/index.html. */
    private static Path resolveStaticRoot(String configured) {
        List<Path> candidates = List.of(
                Path.of(configured), Path.of(".."), Path.of("."), Path.of("../.."));
        for (Path c : candidates) {
            Path abs = c.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs.resolve("public/index.html"))) return abs;
        }
        return Path.of(configured).toAbsolutePath().normalize();
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/shared/**")
                .addResourceLocations(staticRoot.resolve("shared").toUri().toString())
                .setCacheControl(CacheControl.noCache().cachePublic())
                .resourceChain(true)
                .addResolver(new SafeFileResolver(false));
        registry.addResourceHandler("/**")
                .addResourceLocations(staticRoot.resolve("public").toUri().toString())
                .setCacheControl(CacheControl.noCache().cachePublic())
                .resourceChain(true)
                .addResolver(new SafeFileResolver(true));
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*");
    }

    /**
     * Resolves regular files only (directories yield 404, like the Node mock),
     * rejects path traversal, and maps "/" to index.html.
     */
    private static final class SafeFileResolver extends PathResourceResolver {
        private final boolean indexFallback;

        SafeFileResolver(boolean indexFallback) {
            this.indexFallback = indexFallback;
        }

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            if (resourcePath == null || resourcePath.isBlank() || "/".equals(resourcePath)) {
                if (!indexFallback) return null;
                Resource index = location.createRelative("index.html");
                return index.exists() ? index : null;
            }
            String clean = StringUtils.cleanPath(resourcePath);
            if (clean.contains("..")) return null;
            Resource requested = location.createRelative(clean);
            try {
                // Regular files only (directories yield 404, like the Node mock).
                // Note: file: locations surface as UrlResource/FileUrlResource, not
                // FileSystemResource, so check via getFile() instead of instanceof.
                if (requested.exists() && requested.isFile() && requested.getFile().isFile()) {
                    return requested;
                }
            } catch (IOException ignored) {
                // fall through to 404
            }
            return null;
        }
    }
}
