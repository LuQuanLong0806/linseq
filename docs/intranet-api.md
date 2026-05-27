# 内网系统 API 接口文档

> 更新时间：2026-05-26 14:50
> 来源系统：公司内网任务管理系统（http://10.0.12.119:8868）

## 系统信息

| 项目 | 值 |
|------|-----|
| 登录页 | `http://10.0.12.119:8868/demo/account/login.htm` |
| 首页 | `http://10.0.12.119:8868/demo/index.htm` |
| 详情页 | `http://10.0.12.119:8868/demo/loadPage.htm?pageName=demo/tasklist/yfxqdMgrdbEdit` |
| 登录方式 | 表单登录（用户名+密码） |
| 认证方式 | Cookie/Session (JSESSIONID) |
| 前端框架 | mini-ui (jQuery) |
| 富文本编辑 | Summernote |
| 文件上传 | ajaxfileupload |

## 登录凭据

| 字段 | 值 |
|------|-----|
| 用户名 | luql |
| 密码 | 123 |

## 页面结构

```
首页 index.htm
├── 待办列表（点击 daiban_top 或"督查督办"进入）
│   ├── 主列表 iframe: /demo/tasklist/db.htm?type=daiban
│   └── 详情弹窗 iframe: /demo/loadPage.htm?pageName=demo/tasklist/yfxqdMgrdbEdit
│       └── 审批日志 grid: historyGrid
│       └── 关闭理由 grid: guanbiGrid
├── 日志 iframe: /demo/tasklist/tasklist.htm?type=rizhi
└── 加班 iframe: /demo/tasklist/tasklist.htm?type=jiaban
```

## API 接口清单

### 1. 任务列表（核心 - 列表页）

**POST** `/demo/tasklist/getTasklistList.action`

请求参数（form-urlencoded）：

| 参数 | 类型 | 说明 |
|------|------|------|
| pageIndex | number | 页码，从 0 开始 |
| pageSize | number | 每页条数，建议 200 |
| filterDaiban | string | "true"=只看待办, "0"=全部 |
| guanbi | string | "0"=未关闭, "1"=已关闭 |

响应格式：

```json
{
  "pageInfo": { "pageIndex": 0, "pageSize": 200 },
  "sumData": [任务对象数组],
  "total": 56
}
```

### 2. 任务详情（核心 - 详情页）

**POST** `/demo/tasklist/getTasklistList2.action`

请求参数（form-urlencoded）：

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 任务内网ID（如 "8a808cf79e3ec325019e447435b00288"） |
| pageIndex | number | 页码，固定 0 |
| pageSize | number | 固定 10 |
| filterDaiban | boolean | true |

响应格式：

```json
{
  "pageInfo": { "pageIndex": 0, "pageSize": 10 },
  "gzlFlag": false,
  "hdgzlFlag": false,
  "sumData": [{ "total": 56 }],
  "total": 56,
  "data": [任务详情对象（完整字段）]
}
```

**关键字段差异（相比列表接口多出的字段）：**
- `gzlFlag` — 工时是否可编辑
- `hdgzlFlag` — 核定工时是否可编辑

### 3. 审批日志

**POST** `/demo/workFlow/getWorkFlowHistory.action`

请求参数（form-urlencoded）：

| 参数 | 类型 | 说明 |
|------|------|------|
| workId | string | 工作项ID（如 "HZ808cf79e3ec57b019e447439113131"） |

响应：mini-ui Grid 数据格式

列字段：
- 序号
- 节点名称
- 处理人
- 操作时间
- 操作
- 累计时间
- `sxcomments` — 审批意见内容
- `ALLATORIxDEMO` — 审批日志ID

### 4. 关闭理由列表

**POST** `/demo/tasklist/getGuanbiLiyouList.action`

请求参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| pid | string | 任务ID |

### 5. 审批按钮（动态获取）

**POST** `/demo/workFlow/getButtonJsonArr.action`

请求参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| workId | string | 工作项ID |

响应格式：

```json
{
  "buttonJsonArr": [
    { "value": "提交", "key": "submit" },
    { "value": "暂存", "key": "save" },
    { "value": "拿回", "key": "getback" },
    { "value": "退回", "key": "reject" },
    { "value": "转办", "key": "move" }
  ],
  "fldList": [
    {
      "checkField": "必填字段列表",
      "editField": "可编辑字段列表",
      "hiddenField": "隐藏字段列表",
      "readField": "只读字段列表"
    }
  ]
}
```

### 6. 保存/更新任务

**POST** `/demo/tasklist/saveOrUpdateTasklist.action`

请求参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| formData | string | JSON字符串，包含所有表单字段 |
| xuqiuFujianId | string | 需求文档附件ID（逗号分隔） |
| querenFujianId | string | 客户确认附件ID（逗号分隔） |
| zicefujianId | string | 开发自测报告附件ID（逗号分隔） |

响应：`{ "success": true/false, "message": "..." }`

### 7. 删除任务

**POST** `/demo/tasklist/deleteTasklist.action`

请求参数：`{ id: taskId }`

### 8. 附件管理

#### 获取附件列表

**POST** `/demo/fujian/getFujiansByPid.action`

请求参数：`{ pid: taskId }`

响应：

```json
{
  "list": [
    {
      "fileName": "2026052016140188_【前端】宁对接前端需求0414.pdf",
      "filePath": "D:\\invertImg\\2026052016140188_【前端】宁对接前端需求0414.docx",
      "pid": "8a808cf79e3ec325019e447435b00288",
      "id": "B355D8A6-6776-48CD-B86D-55324B264E12",
      "sort": 1
    }
  ],
  "success": true
}
```

- sort=1 → 需求文档
- sort=2 → 客户确认附件
- sort=3 → 开发自测报告
- `list[0].id` 可直接用于预览接口

#### 上传附件（富文本图片）

**POST** `/demo/fujian/uploadFileData2.action`

请求：FormData，字段 `file`

响应：`{ "filePath": "...", "success": true }`

#### 上传附件（表单附件）

**POST** `/demo/tasklist/uploadFileData.action`

请求：FormData，字段 `file`

响应：`{ "fileId": "...", "fileName": "...", "success": true }`

#### 下载附件

**GET** `/demo/tasklist/downloadData.action?id={fujianId}`

#### 预览附件

**GET** `/demo/tasklist/YulanData.action?id={fujianId}`

示例：`http://10.0.12.119:8868/demo/tasklist/YulanData.action?id=B355D8A6-6776-48CD-B86D-55324B264E12`

- 直接在浏览器打开可预览文档（需登录态 JSESSIONID）
- 返回文件二进制流（Content-Type 根据文件类型自动设置）

#### 删除附件

**POST** `/demo/tasklist/deleteFujian.action`

请求参数：`{ id: fujianId }`

### 9. 审批意见回复

#### 保存回复

**POST** `/demo/tasklist/saveHuifuNeirong.action`

请求参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| hfnr | string | 回复内容 |
| workId | string | 工作项ID |
| historyId | string | 审批日志ID |

#### 获取回复列表

**POST** `/demo/tasklist/getHuifuNeirong.action`

请求参数：`{ workId, historyId }`

响应：`{ "success": true, "data": [{ "trueName", "hfnr" }] }`

### 10. 常用语句

**POST** `/demo/demoBaseChangyongyujuController/listDemoBaseChangyongyujuList.action`

请求参数：`{ pageIndex: 0, pageSize: 9999 }`

响应：`{ "success": true, "data": [{ "changyongyuju" }] }`

### 11. 产品联动

#### 根据项目获取产品列表

**GET** `/demo/demoBaseChanpin/getChanpinByXmid.action?xmmc={projectId}`

#### 根据产品获取模块列表

**GET** `/demo/demoBaseChanpin/getMokuaiByPid.action?pid={productId}`

### 12. 其他辅助接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/demo/tasklist/panduanJiaban.action` | POST | 加班判断 |
| `/demo/tasklist/panduanRizhi.action` | POST | 日志判断 |
| `/demo/dcdb/queryDcdbdbnum.action` | POST | 督办数量 |
| `/demo/tasklist/getRizhiList.action` | POST | 日志列表 |
| `/demo/tasklist/getYujingTasklistList.action` | POST | 预警任务 |

### 13. 登录

**POST** `/demo/account/loginForZdxm.action`

请求参数：`{ userName, userPwd }`

---

## 详情页表单字段清单

| 字段ID | 中文名 | 类型 | 必填 | 说明 |
|--------|--------|------|------|------|
| id | 任务ID | hidden | - | 内网唯一ID |
| deptId | 部门ID | hidden | - | |
| isxuqiu | 需求标记 | hidden | - | 值同 bugOrXuqiu |
| isneibu | 内部标记 | hidden | - | 项目选择联动 |
| flowId | 流程ID | hidden | - | 如 "170405YFXQD" |
| sp_bz | 审批备注 | hidden | - | |
| xmmc | 项目名称 | combobox | ✅ | 联动 khmc, khjl |
| bugOrXuqiu | 需求/BUG | radio | ✅ | xuqiu/bug/sheji/wendang |
| jibie | 级别 | radio | ✅ | A=紧急, B=一般, C=次要 |
| bglx | BUG类型 | combobox | - | 仅 bug 时显示 |
| xqlx | 需求类型 | combobox | - | 仅 xuqiu 时显示 |
| rwzj | 任务简述 | textbox | ✅ | 20字以内 |
| xuqiuFujianId | 需求文档 | file | ✅ | sort=1 附件 |
| querenFujianId | 客户确认附件 | file | 条件 | sort=2 附件，非内部项目必填 |
| zicefujianId | 开发自测报告 | file | 条件 | sort=3 附件，开发完成节点必填 |
| chanpin | 产品 | combobox | ✅ | 联动 mokuai |
| version | 版本 | combobox | - | |
| mokuai | 模块 | combobox | ✅ | 由产品联动，联动 cpjl, yffzr |
| cpjl | 产品经理 | combobox | - | 由模块联动 |
| yffzr | 研发负责人 | textbox | - | 由模块联动 |
| khmc | 客户名称 | textbox | ✅ | 由项目联动 |
| khjl | 客户经理 | textbox | ✅ | 由项目联动 |
| kfry | 研发人员 | combobox | - | 开发完成节点必填 |
| danjuCode | 任务单号 | textbox | - | |
| tjrq | 提交日期 | datepicker | - | 只读 |
| gzl | 计划小时 | textbox | ✅ | 数字 |
| jhrq | 预计完成日期 | datepicker | ✅ | |
| jhwcrq | 计划完成日期 | datepicker | - | |
| yfaprq | 研发安排日期 | datepicker | - | 只读 |
| sjwcrq | 开发完成日期 | datepicker | - | 只读 |
| csqrrq | 测试确认日期 | datepicker | - | |
| rwfz | 实际小时 | textbox | - | |
| rwsfgb | 测试完成 | radio | - | 0=开启, 1=关闭 |
| sp_spr | 审批人 | textbox | - | 当前登录用户 |
| sp_spDate | 审批日期 | datepicker | - | 当前日期 |
| sp_spyj | 审批意见 | textarea | - | |

## 联动关系

1. **项目选择 (xmmc)** → 自动填入 khmc(客户名称)、khjl(客户经理)
2. **项目选择 (xmmc)** → 加载产品列表 chanpin
3. **产品选择 (chanpin)** → 加载模块列表 mokuai
4. **模块选择 (mokuai)** → 自动填入 cpjl(产品经理)、yffzr(研发负责人)
5. **需求/BUG (bugOrXuqiu)** → 切换显示 bglx/xqlxDiv
6. **研发人员/工时** → 自动计算预计完成日期

## 业务流程节点

```
提交 → 研发安排 → 开发完成 → 测试 → 产品复核 → 实施确认 → 已结束
         ↓           ↓
       (可退回)    (可退回)
```

| 节点名称 | NODEID | 说明 |
|---------|--------|------|
| 开发完成 | Node4 | 研发人员需上传自测报告，选择研发人员 |
| 测试 | Node5 | |
| 产品复核 | Node6 | |
| 实施确认 | - | |
| 已结束 | - | rwsfgb=1 |

## 任务对象字段映射

| 内网字段 | 中文含义 | 本地映射 | 说明 |
|---------|---------|---------|------|
| id | 任务ID | intranet_id | 内网唯一ID（十六进制字符串） |
| workId | 工作项ID | work_id | 前缀HZ的UUID |
| danjuCode | 任务单号 | source_id | 格式如 2605200084 |
| rwzj | 任务简述 | title | 主要标题 |
| rwzj2 | 任务简述2 | description | 更详细的描述 |
| xmmc | 项目名称 | project | 如"宁对接小程序" |
| khmc | 客户名称 | customer | 如"新工数科" |
| khjl | 客户经理 | customer_manager | 如"李媛" |
| cpmk | 产品模块 | module | 如"经济发展-企业服务-供需发布" |
| mokuai | 模块简称 | module_short | 如"企业服务-供需发布" |
| chanpin | 产品 | product | 如"经济发展" |
| rwlx | 任务类型 | task_type | 如"业务需求" |
| bugOrXuqiu | 需求/BUG | bug_or_req | xuqiu/bug/sheji/wendang |
| bglx | BUG类型 | - | |
| jibie | 级别 | priority | A=紧急, B=一般, C=次要 |
| gzl | 计划工时 | work_hours | 数字，如 2, 16 |
| rwfz | 实际工时 | - | 数字 |
| jhrq | 预计完成日期 | deadline | YYYY-MM-DD |
| jhwcrq | 计划完成日期 | - | |
| yfaprq | 研发安排日期 | - | |
| sjwcrq | 开发完成日期 | - | |
| csqrrq | 测试确认日期 | - | |
| tjrq | 提交日期 | submit_time | YYYY-MM-DD HH:mm:ss |
| createDate | 创建日期 | create_time | YYYY-MM-DD HH:mm:ss |
| updateDate | 更新日期 | update_time | YYYY-MM-DD HH:mm:ss |
| NODEID | 节点ID | intranet_node | 如 "Node4" |
| NEXTNODENAME | 节点名称 | intranet_node_name | 如"开发完成" |
| jiedian | 节点序号 | node_index | 数字 |
| dbry | 待办人员 | supervisor | 如"鹿全龙" |
| dbryId | 待办人员ID | supervisor_id | |
| kfry | 开发人员 | developer | |
| cpjl | 产品经理 | product_manager | |
| yffzr | 研发负责人 | dev_leader | |
| daibanren | 待办人 | handler | |
| deptName | 部门名称 | department | |
| deptId | 部门ID | department_id | |
| rwsfgb | 是否关闭 | is_closed | 0=未关闭, 1=已关闭 |
| flowId | 流程ID | flow_id | 如"170405YFXQD" |
| version | 版本 | version | |
| zhiliuDay | 滞留天数 | stale_days | |
| liuchunDay | 流转天数 | flow_days | |
| afterCreateDayNum | 创建后天数 | days_since_create | |
| tuihuiFlag | 退回标记 | reject_flag | 0或1 |

## 状态映射规则

| NEXTNODENAME | 条件 | 本地 status |
|-------------|------|------------|
| 开发完成 | 正常 | self_test |
| 测试 | 正常 | testing |
| 产品复核 | 正常 | verifying |
| 已结束 | 正常 | completed |
| 任意 | rwsfgb=1 | completed |
| 任意 | tuihuiFlag=1 | rejected |
| 其他 | - | pending |

## 优先级映射

| 内网 jibie | 本地 priority |
|-----------|--------------|
| A | urgent |
| B | high |
| C | medium |
| 无 | low |

## 技术要点

1. **登录方式**：Puppeteer 模拟登录获取 JSESSIONID cookie
2. **API 调用**：登录后可直接用 Node.js fetch 调用 API
3. **详情页加载流程**：
   - 列表页双击 → 打开 yfxqdMgrdbEdit 页面
   - 调用 `getTasklistList2.action` 获取详情数据
   - 调用 `getWorkFlowHistory.action` 加载审批日志
   - 调用 `getButtonJsonArr.action` 获取动态按钮和字段权限
   - 调用 `getFujiansByPid.action` 加载附件列表
4. **数据量**：全量待办约 56 条，单次请求 pageSize=200 即可
5. **mini-ui 框架**：Grid 使用 `setUrl` + `load` 方式加载数据
6. **PowerShell 兼容**：URL 中的 `&` 需用 URLSearchParams 避免解析问题
