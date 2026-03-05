package com.scihub.sensitiveword.controller;

import com.scihub.sensitiveword.service.SensitiveWordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class SensitiveWordController {

    @Autowired
    private SensitiveWordService service;

    /**
     * POST /check
     * 正文检测，只走 tag 0-4 过滤
     * Request:  { "texts": ["text1", "text2"] }
     * Response: { "ok": true/false, "hits": ["word1", "word2"] }
     */
    @PostMapping("/check")
    public Map<String, Object> check(@RequestBody Map<String, List<String>> body) {
        List<String> texts = body.getOrDefault("texts", List.of());
        List<String> hits = service.findAll(texts);
        return Map.of("ok", hits.isEmpty(), "hits", hits);
    }

    /**
     * POST /check-names
     * 人名检测，全量（无 tag 过滤），保留白名单
     * Request:  { "texts": ["人名1", "人名2"] }
     * Response: { "ok": true/false, "hits": ["人名1"] }
     */
    @PostMapping("/check-names")
    public Map<String, Object> checkNames(@RequestBody Map<String, List<String>> body) {
        List<String> texts = body.getOrDefault("texts", List.of());
        List<String> hits = service.findAllNoFilter(texts);
        return Map.of("ok", hits.isEmpty(), "hits", hits);
    }
}
