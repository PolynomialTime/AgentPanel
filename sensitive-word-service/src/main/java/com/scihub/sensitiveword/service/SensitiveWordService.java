package com.scihub.sensitiveword.service;

import com.github.houbb.sensitive.word.bs.SensitiveWordBs;
import com.github.houbb.sensitive.word.support.resultcondition.WordResultConditions;
import com.github.houbb.sensitive.word.support.tag.WordTags;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class SensitiveWordService {

    private static final List<String> ALLOW_LIST = Arrays.asList(
            "下注", "买断", "工作证", "干到", "干干", "庄家",
            "彩票", "情报", "成人", "拍卖", "来干", "高潮", "霍金"
    );

    // 正文检测：只走 tag 0-4
    private final SensitiveWordBs wordBs = SensitiveWordBs.newInstance()
            .wordTag(WordTags.system())
            .wordResultCondition(WordResultConditions.wordTags(Arrays.asList("0", "1", "2", "3", "4")))
            .wordAllow(() -> ALLOW_LIST)
            .init();

    // 人名检测：全量（无 tag 过滤），保留白名单
    private final SensitiveWordBs wordBsAll = SensitiveWordBs.newInstance()
            .wordTag(WordTags.system())
            .wordAllow(() -> ALLOW_LIST)
            .init();

    public List<String> findAll(List<String> texts) {
        Set<String> seen = new LinkedHashSet<>();
        for (String text : texts) {
            if (text != null && !text.isBlank()) {
                seen.addAll(wordBs.findAll(text));
            }
        }
        return new ArrayList<>(seen);
    }

    public List<String> findAllNoFilter(List<String> texts) {
        Set<String> seen = new LinkedHashSet<>();
        for (String text : texts) {
            if (text != null && !text.isBlank()) {
                seen.addAll(wordBsAll.findAll(text));
            }
        }
        return new ArrayList<>(seen);
    }
}
