from __future__ import annotations

import json
import re
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
SECTION_NAMES = {
    "单选题": "single",
    "二、多选题": "multiple",
    "三、判断题": "judge",
    "四、简答题": "short",
    "综合题": "comprehensive",
}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def clean_question_text(text: str) -> str:
    text = re.sub(r"^\d+[.、]\s*", "", text.strip())
    text = re.sub(r"[（(]\s*([A-D]+|正确|错误|对|错|√|×)\s*[）)]\s*$", "", text)
    return normalize(text)


def split_answer_from_text(text: str) -> tuple[str, str]:
    match = re.search(r"[（(]\s*([A-D]+|正确|错误|对|错|√|×)\s*[）)]\s*$", text)
    if not match:
        return clean_question_text(text), ""
    return clean_question_text(text), match.group(1)


def is_option(text: str) -> bool:
    return bool(re.match(r"^[A-D][.、]\s*", text))


def option_pair(text: str) -> tuple[str, str]:
    key, value = re.split(r"[.、]\s*", text, maxsplit=1)
    return key, normalize(value)


GLOSSARY = {
    "Lucene": "Lucene：全文检索核心库，可以理解为 ElasticSearch 底层的“搜索发动机”。",
    "Solr": "Solr：同样基于 Lucene 的搜索服务器，常与传统搜索、ZooKeeper 管理联系在一起。",
    "ZooKeeper": "ZooKeeper：分布式协调服务，SolrCloud 常用它做集群协调。",
    "RESTful": "RESTful：一种 HTTP 接口风格，用 GET、POST、PUT、DELETE 表示不同操作。",
    "HTTP": "HTTP：浏览器和客户端访问服务常用的网络协议。",
    "Index": "Index：索引，类似关系型数据库里的表，用来组织一类文档。",
    "Document": "Document：文档，ElasticSearch 中存储和检索的基本数据单位。",
    "Field": "Field：字段，文档里的属性，类似数据库表中的列。",
    "Shard": "Shard：分片，把索引数据拆成多份，便于扩容和并行处理。",
    "Replica": "Replica：复制分片，是主分片的副本，用来提高可用性和搜索吞吐。",
    "master": "master：主节点角色，负责集群管理、元数据变更和分片调度。",
    "text": "text：文本类型，会分词，适合全文检索。",
    "keyword": "keyword：关键词类型，不分词，适合精确匹配、排序和聚合。",
    "match": "match：匹配查询，会先分析/分词，适合全文检索。",
    "term": "term：词项查询，不分析查询词，适合精确值。",
    "match_phrase": "match_phrase：短语匹配，要求词语按顺序整体出现。",
    "multi_match": "multi_match：多字段匹配，一次在多个字段里搜索。",
    "bool": "bool：布尔查询，用 must、filter、should 等组合条件。",
    "range": "range：范围查询，常用于数字、日期区间。",
    "highlight": "highlight：高亮显示，把命中的关键词突出展示。",
    "BulkRequest": "BulkRequest：批量请求类，用来一次提交多条增删改操作。",
    "RestHighLevelClient": "RestHighLevelClient：Java 高级 REST 客户端，Spring Boot 整合 ES 7.x 常见。",
    "Snapshot": "Snapshot：快照备份，ElasticSearch 官方备份/恢复机制。",
    "_reindex": "_reindex：重建索引/复制数据 API，可把数据复制到新索引或另一个集群。",
    "ik_smart": "ik_smart：IK 最少切分，词更少，偏精确和高效。",
    "ik_max_word": "ik_max_word：IK 最细切分，词更多，偏提高召回率。",
}


def answer_text(answer: str, options: dict[str, str]) -> str:
    return "；".join(f"{key}. {options.get(key, '')}" for key in answer)


def glossary_note(text: str) -> str:
    notes = []
    matched_keys = []
    for key in sorted(GLOSSARY, key=len, reverse=True):
        value = GLOSSARY[key]
        if key in text and value not in notes:
            if any(key in matched for matched in matched_keys):
                continue
            matched_keys.append(key)
            notes.append(value)
    return " ".join(notes[:3])


def concept_reason(question: str, answer: str, options: dict[str, str], qtype: str) -> str:
    correct_text = answer_text(answer, options)
    text = f"{question} {correct_text}"
    rules = [
        (["9300", "集群间通信"], "9300 是 ElasticSearch 节点之间通信的端口；9200 是给外部 HTTP/REST 客户端访问的端口。"),
        (["9200", "HTTP"], "9200 是默认 HTTP REST 接口端口，浏览器、Postman 或程序客户端通常通过它访问 ES。"),
        (["Lucene"], "ElasticSearch 的全文检索能力建立在 Lucene 之上；ES 负责分布式、REST 接口和集群能力。"),
        (["Java", "开发"], "ElasticSearch 本身由 Java 开发，所以部署时经常会遇到 JDK 版本要求。"),
        (["关系型数据库存储"], "ElasticSearch 是搜索和分析引擎，不是强调事务和表关系的关系型数据库。"),
        (["主分片", "5"], "资料按 ES 早期默认值记：一个索引默认 5 个主分片；新版本默认值可能不同，考试按资料为准。"),
        (["复制分片", "1"], "复制分片默认 1 份，作用是容灾和提升搜索吞吐，不负责扩大主数据容量。"),
        (["/_cat/indices"], "_cat 系列 API 适合查看集群/索引状态；indices 表示索引列表。"),
        (["/_cluster/health"], "cluster 是集群，health 是健康状态，所以查看集群健康用 /_cluster/health。"),
        (["PUT", "创建索引"], "PUT 通常用于创建或替换指定资源；创建指定名称的索引用 PUT。"),
        (["幂等", "PUT"], "PUT 指定 ID，多次执行结果一致；POST 自动生成 ID，多次执行会产生多条文档。"),
        (["text", "keyword"], "text 会分词，适合全文检索；keyword 不分词，适合精确匹配。"),
        (["node.master"], "node.master 控制节点是否有资格成为 master；node.data 控制是否保存数据。"),
        (["node.data"], "node.data 表示数据节点角色，负责存储数据和执行数据相关操作。"),
        (["ik_smart"], "ik_smart 是最少切分，切出的词少，查询更精确、噪声更少。"),
        (["ik_max_word"], "ik_max_word 是最细切分，切出的词多，召回更多，适合新闻、文章等全文搜索。"),
        (["standard", "中文"], "standard 分词器对中文通常按单字切分，语义效果不如 IK 中文分词器。"),
        (["size", "每页"], "分页时 from 表示从哪里开始，size 表示每页返回多少条。"),
        (["multi_match"], "multi_match 中 multi 是“多个”的意思，用于多个字段同时匹配。"),
        (["match_phrase"], "phrase 是“短语”，match_phrase 要求短语整体匹配，比 match 更严格。"),
        (["term"], "term 不会分词，适合 keyword、数字、日期等精确匹配字段。"),
        (["BulkRequest"], "Bulk 表示“批量”，BulkRequest 就是批量增删改请求。"),
        (["RestHighLevelClient"], "ES 7.x 的 Java 集成常用 RestHighLevelClient；TransportClient 已逐步废弃。"),
        (["CreateIndexRequest"], "CreateIndexRequest 按名字直译就是“创建索引请求”。"),
        (["exists"], "exists 表示“存在”，indices().exists() 用来判断索引是否存在。"),
        (["yellow"], "yellow 表示主分片可用但复制分片未完全分配；常见于单节点有副本的情况。"),
        (["green"], "green 表示主分片和复制分片都正常，是最健康的状态。"),
        (["red"], "red 表示至少有主分片不可用，数据读写会受影响。"),
        (["Snapshot"], "Snapshot 是官方快照机制，适合做增量备份和恢复。"),
        (["_reindex"], "_reindex 可把数据复制到其他索引或集群，适合迁移或小规模备份。"),
    ]
    for keywords, reason in rules:
        if all(keyword in text for keyword in keywords):
            return reason
    if qtype == "multiple":
        return "本题是多选，要把每个选项逐项代入 ElasticSearch 的特点、概念或用法判断，不能只选最熟悉的一项。"
    if qtype == "judge":
        return "判断题先看题干有没有“只能、必须、随时、无限”等绝对词，再回到 ES 的实际机制判断。"
    return "本题考查基础概念。复习时抓住题干关键词，再把它和正确答案中的核心术语对应起来。"


def objective_explanation(question: str, answer: str, options: dict[str, str], qtype: str) -> str:
    if qtype == "judge":
        note = glossary_note(question)
        suffix = f" 术语理解：{note}" if note else ""
        return f"该说法为“{answer}”。{concept_reason(question, answer, options, qtype)}{suffix}"
    correct = answer_text(answer, options)
    note = glossary_note(f"{question} {correct}")
    suffix = f" 术语理解：{note}" if note else ""
    if qtype == "multiple":
        return f"正确选项是 {answer}（{correct}）。{concept_reason(question, answer, options, qtype)}{suffix}"
    return f"正确选项是 {answer}（{correct}）。{concept_reason(question, answer, options, qtype)}{suffix}"


def memory_tip(text: str, qtype: str) -> str:
    rules = [
        ("9300", "9300 记“节点内部聊”：ES 节点之间通信走 9300；9200 是外部 HTTP 访问。"),
        ("9200", "9200 记“HTTP 给人用”：浏览器、REST 请求、Postman 访问 ES 时想到 9200。"),
        ("Lucene", "Lucene 读作“搜索内核”：ES = 分布式能力 + Lucene 搜索发动机。"),
        ("Java", "ES 用 Java 写，所以安装部署常和 JDK 版本绑定记。"),
        ("Solr", "Solr 和 ES 都基于 Lucene；Solr 常联想 ZooKeeper，ES 常联想开箱即用和近实时。"),
        ("ZooKeeper", "ZooKeeper 可理解为“动物园管理员”：在分布式系统里做协调管理。"),
        ("主分片", "主分片记“原件”：真正承载数据；复制分片记“复印件”：容灾和分摊查询。"),
        ("复制分片", "复制分片记“复印件”：主分片坏了可顶上，也能分摊搜索压力。"),
        ("分片", "Shard 分片记“拆”：把一个索引拆成多份，解决容量和并行处理。"),
        ("green", "健康状态按红绿灯：green 全正常，yellow 副本有缺，red 主分片有缺。"),
        ("yellow", "yellow 像黄灯警告：主分片能用，但复制分片没完全分配。"),
        ("red", "red 像红灯故障：至少有主分片不可用，要优先处理。"),
        ("text", "text 是“长文本”：会分词，适合全文检索；keyword 是“完整关键词”：不分词。"),
        ("keyword", "keyword 记“整词保存”：不拆开，适合精确匹配、排序、聚合。"),
        ("match_phrase", "phrase 是“短语”：match_phrase 要求整句话或短语按顺序匹配。"),
        ("multi_match", "multi 是“多个”：multi_match 就是多个字段一起搜。"),
        ("term", "term 是“词项”：不分词，拿完整值去精确匹配。"),
        ("match", "match 记“先分析再匹配”：适合 text 字段的全文搜索。"),
        ("ik_smart", "smart = 聪明省事：切词少，偏精确、效率高。"),
        ("ik_max_word", "max_word = 最大词量：切词多，偏召回、适合文章搜索。"),
        ("RestHighLevelClient", "RestHighLevelClient 直译“高级 REST 客户端”，ES 7.x Java 整合常见。"),
        ("BulkRequest", "Bulk 是“批量”：BulkRequest 看到批量增删改就选它。"),
        ("CreateIndexRequest", "CreateIndexRequest 拆词记：Create 创建 + Index 索引 + Request 请求。"),
        ("exists", "exists 就是“存在”：判断索引是否存在看 exists。"),
        ("跨域", "跨域记 cors：http.cors.enabled 打开跨域；network.host 是网络绑定。"),
        ("Snapshot", "Snapshot 是“快照”：官方备份恢复，像给集群拍一张可恢复的照片。"),
        ("_reindex", "_reindex 记“重新索引/搬数据”：常用于复制、迁移或重建索引。"),
        ("备份", "备份两条路：Snapshot 官方快照；_reindex 复制到别处。"),
    ]
    for keyword, tip in rules:
        if keyword in text:
            return tip
    if qtype == "multiple":
        return "多选题用“逐项判定法”：先排除明显错误项，再检查是否漏掉同类正确项；不要只凭第一印象选一个。"
    if qtype == "judge":
        return "判断题重点看绝对词：看到“只能、必须、随时、无限”等词，先警惕它可能是错误表述。"
    if qtype == "short":
        return "简答题用“三点式”：先写核心概念，再列 2-4 个要点，最后补一句作用或适用场景。"
    if qtype == "comprehensive":
        return "综合题用“场景-字段-查询-优化”四步：先看业务场景，再定字段类型，接着写 DSL，最后补原因或优化措施。"
    return "把题干关键词和答案关键词配对记忆，复习时先遮住答案，自己说出对应概念。"


def collect_sections(paragraphs: list[str]) -> dict[str, list[str]]:
    current = ""
    sections: dict[str, list[str]] = {value: [] for value in SECTION_NAMES.values()}
    for paragraph in paragraphs:
        if paragraph in SECTION_NAMES:
            current = SECTION_NAMES[paragraph]
            continue
        if current:
            sections[current].append(paragraph)
    return sections


def parse_choices(lines: list[str], qtype: str, start_id: int) -> list[dict]:
    questions = []
    idx = 0
    qid = start_id
    while idx < len(lines):
        line = lines[idx]
        question, answer = split_answer_from_text(line)
        if not answer:
            idx += 1
            continue
        options: dict[str, str] = {}
        idx += 1
        while idx < len(lines) and is_option(lines[idx]):
            key, value = option_pair(lines[idx])
            options[key] = value
            idx += 1
        questions.append(
            {
                "id": f"q{qid:03d}",
                "type": qtype,
                "question": question,
                "options": options,
                "answer": list(answer) if qtype == "multiple" else answer,
                "referenceAnswer": answer,
                "explanation": objective_explanation(question, answer, options, qtype),
                "memoryTip": memory_tip(question + " " + answer_text(answer, options), qtype),
                "source": "ElasticSearch分布式搜索引擎-复习资料.docx",
                "tags": infer_tags(question + " " + " ".join(options.values())),
            }
        )
        qid += 1
    return questions


def parse_judge(lines: list[str], start_id: int) -> list[dict]:
    questions = []
    qid = start_id
    for line in lines:
        question, answer = split_answer_from_text(line)
        if not answer:
            continue
        answer_label = "正确" if answer in {"正确", "对", "√"} else "错误"
        answer_key = "A" if answer_label == "正确" else "B"
        questions.append(
            {
                "id": f"q{qid:03d}",
                "type": "judge",
                "question": question,
                "options": {"A": "正确", "B": "错误"},
                "answer": answer_key,
                "referenceAnswer": answer_label,
                "explanation": objective_explanation(question, answer_label, {}, "judge"),
                "memoryTip": memory_tip(question, "judge"),
                "source": "ElasticSearch分布式搜索引擎-复习资料.docx",
                "tags": infer_tags(question),
            }
        )
        qid += 1
    return questions


def looks_like_short_question(line: str) -> bool:
    if re.match(r"^\d+[.、]\s*", line):
        return True
    return line.startswith(("简述", "解释", "说明", "列出", "描述", "比较", "分析"))


def parse_short(lines: list[str], start_id: int) -> list[dict]:
    questions = []
    current: dict | None = None
    qid = start_id
    for line in lines:
        if looks_like_short_question(line):
            if current:
                questions.append(current)
            current = {
                "id": f"q{qid:03d}",
                "type": "short",
                "question": clean_question_text(line),
                "options": {},
                "answer": "",
                "referenceAnswer": "",
                "explanation": "主观题以参考答案为准。答题时先覆盖关键词，再补充原因、步骤或对比点。",
                "memoryTip": memory_tip(line, "short"),
                "source": "ElasticSearch分布式搜索引擎-复习资料.docx",
                "tags": infer_tags(line),
            }
            qid += 1
        elif current:
            current["referenceAnswer"] = (current["referenceAnswer"] + "\n" + line).strip()
            current["answer"] = current["referenceAnswer"]
            current["tags"] = sorted(set(current["tags"]) | set(infer_tags(line)))
    if current:
        questions.append(current)
    return questions


def is_scenario_start(line: str) -> bool:
    return line.startswith("某") and "ElasticSearch" in line


def looks_like_comprehensive_question(line: str) -> bool:
    if line == "问题":
        return False
    if line.startswith(("应该", "原因", "可能原因", "解决方法", "优化方法", "方法", "优点")):
        return False
    return any(token in line for token in ("请", "应该", "如果")) and not is_scenario_start(line)


def parse_comprehensive(lines: list[str], start_id: int) -> list[dict]:
    questions = []
    context: list[str] = []
    current: dict | None = None
    qid = start_id

    def flush_current() -> None:
        nonlocal current
        if current:
            questions.append(current)
            current = None

    for line in lines:
        if is_scenario_start(line):
            flush_current()
            context = [line]
            continue
        if current is None and not looks_like_comprehensive_question(line):
            if line != "问题":
                context.append(line)
            continue
        if looks_like_comprehensive_question(line):
            flush_current()
            question_text = clean_question_text(line)
            if context:
                question_text = "背景：" + "\n".join(context) + "\n\n问题：" + question_text
            current = {
                "id": f"q{qid:03d}",
                "type": "comprehensive",
                "question": question_text,
                "options": {},
                "answer": "",
                "referenceAnswer": "",
                "explanation": "综合题以参考答案为准。先识别业务场景，再写映射、DSL、原因或优化步骤。",
                "memoryTip": memory_tip(question_text, "comprehensive"),
                "source": "ElasticSearch分布式搜索引擎-复习资料.docx",
                "tags": infer_tags(question_text),
            }
            qid += 1
        elif current:
            current["referenceAnswer"] = (current["referenceAnswer"] + "\n" + line).strip()
            current["answer"] = current["referenceAnswer"]
            current["tags"] = sorted(set(current["tags"]) | set(infer_tags(line)))
    flush_current()
    return questions


def infer_tags(text: str) -> list[str]:
    tag_rules = {
        "基础概念": ["核心", "特点", "概念", "Lucene", "Solr"],
        "集群与分片": ["集群", "节点", "分片", "复制", "master", "健康状态", "yellow", "green", "red"],
        "索引与映射": ["索引", "映射", "字段", "text", "keyword", "类型"],
        "查询 DSL": ["查询", "match", "term", "multi_match", "bool", "range", "highlight", "sort", "aggs"],
        "IK 分词器": ["IK", "ik_smart", "ik_max_word", "分词"],
        "Spring Boot": ["Spring Boot", "RestHighLevelClient", "BulkRequest", "Request"],
        "安装配置": ["安装", "配置", "端口", "9200", "9300", "Head", "跨域"],
        "运维优化": ["备份", "优化", "删除", "故障", "吞吐", "性能"],
    }
    return [tag for tag, words in tag_rules.items() if any(word in text for word in words)] or ["综合复习"]


def tag_memory_tip(question: dict) -> str:
    tags = question.get("tags", [])
    if "基础概念" in tags:
        return "基础概念题用“是什么、做什么、不是什么”三步记：先说定义，再说作用，最后排除容易混淆的概念。"
    if "集群与分片" in tags:
        return "集群题先分角色：cluster 是整体，node 是节点，shard 是分片，replica 是副本，master 管调度。"
    if "索引与映射" in tags:
        return "映射题先问字段要不要分词：要全文检索选 text；要精确匹配、排序、聚合选 keyword 或数值/日期类型。"
    if "查询 DSL" in tags:
        return "DSL 题先看目的：全文搜用 match，多字段用 multi_match，精确值用 term，范围用 range，组合条件用 bool。"
    if "IK 分词器" in tags:
        return "IK 只记一对反义：smart 少切更精确；max_word 多切召回高。"
    if "Spring Boot" in tags:
        return "Spring Boot 整合题按类名直译记：Create 创建，Get 获取，Delete 删除，Bulk 批量，exists 判断存在。"
    if "安装配置" in tags:
        return "配置题按用途记：cluster.name 管集群名，node.* 管节点角色，network/http 管访问和网络。"
    if "运维优化" in tags:
        return "运维题按目标记：备份防丢，分片扩容，副本保可用，索引设计提查询速度。"
    return "复习时先圈出题干关键词，再用一句中文把英文术语翻译出来，最后对应到答案。"


def is_code_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    code_prefixes = ('"', "{", "}", "[", "]", "],")
    return stripped.startswith(code_prefixes) or stripped.startswith('{"') or stripped.endswith("},")


def answer_blocks(answer: str) -> list[dict]:
    blocks: list[dict] = []
    pending_text: list[str] = []
    pending_code: list[str] = []

    def flush_text() -> None:
        nonlocal pending_text
        if pending_text:
            blocks.append({"type": "text", "items": pending_text})
            pending_text = []

    def flush_code() -> None:
        nonlocal pending_code
        if pending_code:
            blocks.append({"type": "code", "content": "\n".join(pending_code)})
            pending_code = []

    for raw_line in answer.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if is_code_line(stripped):
            flush_text()
            pending_code.append(stripped)
        else:
            flush_code()
            pending_text.append(stripped)
    flush_code()
    flush_text()
    for block in blocks:
        if block["type"] == "code":
            block["content"] = indent_code_block(block["content"])
    return blocks


def indent_code_block(code: str) -> str:
    lines = [line.strip() for line in code.splitlines() if line.strip()]
    if not lines:
        return ""
    formatted: list[str] = []
    depth = 0
    for line in lines:
        if line.startswith(("}", "]")):
            depth = max(depth - 1, 0)
        formatted.append(f"{'  ' * depth}{line}")
        opens = line.count("{") + line.count("[")
        closes = line.count("}") + line.count("]")
        depth = max(depth + opens - closes, 0)
    return "\n".join(formatted)


def concise_subjective_answer(question: dict) -> str:
    text = question.get("question", "")
    answer = question.get("referenceAnswer", "")
    combined = f"{text}\n{answer}"

    if "log_content" in combined and "映射" in combined:
        return "log_content 用 text，analyzer 用 ik_smart；原因：最少切分，效率高，减少无关结果。"
    if "title和content" in combined and "分词器" in combined:
        return "title/content 用 ik_max_word；切词多、召回高，适合新闻关键词搜索。"
    if "备份" in combined and "Snapshot" in combined:
        return "两种：Snapshot 快照，支持增量、恢复快；_reindex 复制到另一集群，简单适合小数据。"

    rules = [
        ("ElasticSearch 与 Solr", "Solr 依赖 ZooKeeper、功能更全，偏传统搜索；ElasticSearch 自带分布式协调、REST 简单，偏实时搜索和易用。"),
        ("安装和启动步骤", "下载 → 解压 → 配置 elasticsearch.yml → 准备 JDK → 运行 elasticsearch.bat → 访问 9200 验证。"),
        ("核心概念及其与关系型数据库", "Index≈库/表集合，Type≈表，Document≈行，Field≈列，Mapping≈表结构。"),
        ("索引、类型、文档和字段", "Index 是文档集合；Type 是逻辑分类；Document 是 JSON 数据单元；Field 是文档属性。"),
        ("Head 插件", "下载 Head → 安装 Node.js → 安装 grunt-cli → npm install → grunt server → 访问 9100。"),
        ("match 查询和 term 查询", "match 会分词，适合全文检索；term 不分词，适合 keyword、数字、日期精确匹配。"),
        ("IK 分词器", "ik_smart：少切，偏精确，适合查询；ik_max_word：多切，召回高，适合建索引。"),
        ("创建、查询、更新和删除操作", "增：PUT 指定 ID / POST 自动 ID；查：GET；改：PUT/POST 指定 ID；删：DELETE。"),
        ("聚合查询", "聚合用于统计分析；常见类型：桶聚合、指标聚合、管道聚合、矩阵聚合。"),
        ("分片和复制", "分片负责拆数据、扩容量、并行处理；复制负责高可用、故障转移、提高搜索吞吐。"),
        ("集群的工作原理", "节点组成集群；主节点管状态；索引拆成主分片和副本；节点故障后自动分配分片。"),
        ("集群搭建", "装 JDK → 解压 ES → 配置集群/节点/网络/发现 → 清 data → 逐节点启动并验证。"),
        ("log_content字段的映射配置", "log_content 用 text，analyzer 用 ik_smart；原因：最少切分，效率高，减少无关结果。"),
        ("192.168.1.100", "bool 查询：must 匹配 server_ip 和 log_level，filter 用 range 限制 create_time 为 2024-06-01 当天。"),
        ("健康状态为yellow", "两类原因：单节点副本无法分配；节点离线导致副本丢失。解决：加节点；重启或重新分配。"),
        ("title和content字段应该使用哪种分词器", "title/content 用 ik_max_word；切词多、召回高，适合新闻关键词搜索。"),
        ('关键词 "高考"', "multi_match 同时搜 title、content；highlight 高亮 title、content。"),
        ("不相关的新闻", "原因：分词过细匹配到“考”。优化：用 match_phrase；提高标题字段权重。"),
        ("publisher字段", "publisher 用 keyword；出版社名称是整体，不分词，适合精确匹配。"),
        ("机械工业出版社", "bool 查询：must 同时匹配 publisher=机械工业出版社、category=计算机。"),
        ("查询速度逐渐变慢", "优化：合理分片；优化字段类型；关闭无用 doc_values/fielddata；按年份拆索引并用别名。"),
        ("删除所有 2023 年 1 月 1 日之前", "先查询确认数量 → 用 DeleteByQueryRequest 按 create_time < 2023-01-01 删除 → 验证结果。"),
        ("待发货", "bool 查询：must 匹配 order_status=待发货，filter 用 range 限制 total_amount > 100。"),
        ("备份方法", "两种：Snapshot 快照，支持增量、恢复快；_reindex 复制到另一集群，简单适合小数据。"),
    ]
    for keyword, summary in rules:
        if keyword in combined:
            return summary

    lines = [line.strip() for line in answer.splitlines() if line.strip() and not is_code_line(line)]
    return "；".join(lines[:4])


def enhance_question_quality(question: dict) -> dict:
    if question["type"] in {"single", "multiple"}:
        answer = "".join(question["answer"]) if isinstance(question["answer"], list) else question["answer"]
        context_answer = answer_text(answer, question.get("options", {}))
    elif question["type"] == "judge":
        context_answer = question.get("answer", "")
    else:
        context_answer = question.get("referenceAnswer", "")
    context = " ".join(
        [
            question.get("question", ""),
            context_answer,
        ]
    )
    note = glossary_note(context)
    if note and "术语理解：" not in question.get("explanation", ""):
        question["explanation"] = f"{question['explanation']} 术语理解：{note}"

    generic_tips = [
        "把题干关键词和答案关键词配对记忆",
        "多选题用“逐项判定法”",
    ]
    if any(tip in question.get("memoryTip", "") for tip in generic_tips):
        question["memoryTip"] = tag_memory_tip(question)

    if question["type"] in {"short", "comprehensive"}:
        question["conciseAnswer"] = concise_subjective_answer(question)
        question["answerBlocks"] = answer_blocks(question.get("referenceAnswer", ""))
        if question["type"] == "short":
            question["explanation"] = f"{question['explanation']} 答题方法：先写核心概念，再列关键区别、作用或步骤。"
        else:
            question["explanation"] = f"{question['explanation']} 答题方法：按“场景需求→字段设计→DSL 查询→原因/优化”组织答案。"
    return question


def build_bank() -> dict:
    docx_files = list(ROOT.glob("*.docx"))
    if not docx_files:
        raise FileNotFoundError("No .docx review material found in project root.")

    paragraphs = [normalize(p.text) for p in Document(docx_files[0]).paragraphs if normalize(p.text)]
    sections = collect_sections(paragraphs)

    questions: list[dict] = []
    questions.extend(parse_choices(sections["single"], "single", len(questions) + 1))
    questions.extend(parse_choices(sections["multiple"], "multiple", len(questions) + 1))
    questions.extend(parse_judge(sections["judge"], len(questions) + 1))
    questions.extend(parse_short(sections["short"], len(questions) + 1))
    questions.extend(parse_comprehensive(sections["comprehensive"], len(questions) + 1))
    questions = [enhance_question_quality(question) for question in questions]

    return {
        "meta": {
            "title": "ElasticSearch 分布式搜索引擎复习题库",
            "source": docx_files[0].name,
            "generatedBy": "tools/extract_questions.py",
            "questionCount": len(questions),
            "typeCounts": {
                key: sum(1 for question in questions if question["type"] == key)
                for key in ["single", "multiple", "judge", "short", "comprehensive"]
            },
        },
        "questions": questions,
    }


def main() -> None:
    bank = build_bank()
    out = ROOT / "questions.json"
    out.write_text(json.dumps(bank, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(bank["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
