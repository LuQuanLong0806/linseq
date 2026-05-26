# 内网系统 API 分析报告

## 系统概况

- **地址**: `http://10.0.12.119:8868/demo/`
- **技术栈**: Java + MiniUI (jQuery) + Nginx 1.23.3 + Shiro (JSESSIONID)
- **用户**: luql / 鹿全龙 / 吴江研发
- **userId**: `92bd7cb4-d32b-4935-8ec9-5ddbe0370185`
- **deptId**: `8a808ced5b3c94b7015b3cfdca2f000b` (吴江研发)

---

## 1. 登录接口

### POST `/demo/account/loginForZdxm.action`
- **Content-Type**: `application/x-www-form-urlencoded`
- **参数**: `userName=luql&userPwd=123`
- **响应**: `{"msg":"SUCCESS","indexUrl":"index.htm","code":"SUCCESS"}`
- **Cookie**: 登录成功后服务端通过 `Set-Cookie` 设置 `JSESSIONID`（Path=/demo, HttpOnly）
- ⚠️ **必须先 GET 登录页建立初始 session，再 POST 登录**，否则后续 API 请求会被重定向到登录页

---

## 2. 待办任务列表接口 (核心)

### POST `/demo/tasklist/getTasklistList.action`
- **Content-Type**: `application/x-www-form-urlencoded`
- **Headers**: 需要 `X-Requested-With: XMLHttpRequest`
- **Query 参数**:

| 参数 | 说明 | 示例值 |
|------|------|--------|
| pageIndex | 页码(从0开始) | 0 |
| pageSize | 每页条数 | 200 |
| filterDaiban | 仅待办 | true |
| guanbi | 未关闭任务 | 0 |
| filterYiban | 仅已办 | true |
| createUserId | 按创建人筛选 | userId |

- **响应结构**:
```json
{
  "pageInfo": { "pageIndex": 0, "pageSize": 5 },
  "sumData": [...],  // 任务数组
  "total": 56,
  "data": [...]
}
```

### 字段映射表（44个字段）

| 内网字段 | 中文含义 | 示例值 | 映射到本地 |
|----------|---------|--------|-----------|
| `id` | 内网任务唯一ID | `8a808cf79e3ec325019e447435b00288` | sourceId |
| `danjuCode` | 单据编号 | `2605200084` | displayId |
| `rwzj` | 任务主题(标题) | `【前端】活动详情页-...` | title |
| `rwzj2` | 任务主题(副标题/详细描述) | 同上或更详细 | description |
| `xmmc` | 项目名称 | `宁对接小程序` | project |
| `khmc` | 客户名称 | `新工数科` | customer |
| `cpmk` | 产品模块 | `经济发展-企业服务-供需发布` | module |
| `mokuai` | 模块 | `企业服务-供需发布` | moduleShort |
| `chanpin` | 产品 | `经济发展` | product |
| `rwlx` | 任务类型 | `业务需求` | taskType |
| `bugOrXuqiu` | BUG或需求 | `xuqiu` / `bug` | bugOrReq |
| `jibie` | 级别(优先级) | `A`(紧急) / `B`(高) / `C`(中) | priority |
| `gzl` | 工作量(工时) | `2` | workHours |
| `jhrq` | 计划完成日期(交期) | `2026-05-31` | deadline |
| `tjrq` | 提交日期 | `2026-05-20 16:15:27` | submitTime |
| `createDate` | 创建日期 | `2026-05-20 16:15:27` | createTime |
| `updateDate` | 更新日期 | `2026-05-20 16:15:27` | updateTime |
| `NODEID` | 当前流程节点ID | `Node4` | intranetNode |
| `NEXTNODENAME` | 当前流程节点名称 | `开发完成` | intranetNodeName |
| `jiedian` | 节点序号 | `1` | nodeIndex |
| `rwsfgb` | 任务是否关闭 | `0`(否) / `1`(是) | isClosed |
| `dbry` | 待办人员 | `鹿全龙` | supervisor |
| `dbryId` | 待办人员ID | `92bd7cb4-...` | supervisorId |
| `kfry` | 开发人员 | `` | developer |
| `yffzr` | 研发负责人 | `李伟` | devLeader |
| `cpjl` | 产品经理 | `钱志浩` | productManager |
| `khjl` | 客户经理 | `李媛` | customerManager |
| `daibanren` | 当前待办人 | `张俊杰` | handler |
| `deptName` | 部门名称 | `产品部` | department |
| `deptId` | 部门ID | `8a808cf9...` | departmentId |
| `zhiliuDay` | 滞留天数 | `5` | staleDays |
| `liuchunDay` | 流转天数 | `5` | flowDays |
| `afterCreateDayNum` | 创建后天数 | `6` | daysSinceCreate |
| `flowId` | 流程ID | `170405YFXQD` | flowId |
| `workId` | 工单ID | `HZ808cf7...` | workId |
| `version` | 版本 | `` | version |
| `bglx` | 变更类型 | `` | changeType |
| `rwfz` | 任务分组 | `0` | taskGroup |
| `iszuzhang` | 是否组长 | `0`/`1` | isLeader |
| `ischanpin` | 是否产品 | `0`/`1` | isProduct |
| `isbug` | 是否BUG | `0`/`1` | isBug |
| `createUserId` | 创建人ID | `b14d35d6-...` | createUserId |
| `tijiaoUserId` | 提交人ID | `4dae704b-...` | submitUserId |

---

## 3. 其他关键接口

### 督办数量
- **GET** `/demo/dcdb/queryDcdbdbnum.action?filterDaiban=daiban`
- 返回: `{ xmTotal, total, rwTotal, success }`

### 预警任务列表
- **GET** `/demo/tasklist/getYujingTasklistList.action?pageIndex=0&pageSize=5`
- 返回超期预警任务

### 个人完成率统计
- **GET** `/demo/tasklist/getGrWCLNbgl.action`
- 返回每个人的完成/未完成数量

### 加班判断
- **GET** `/demo/tasklist/panduanJiaban.action?trueName=鹿全龙`
- 返回: `{ success, chuxian }`

### 日志判断
- **GET** `/demo/tasklist/panduanRizhi.action?trueName=...&deptName=...`
- 返回日志填写状态

### 日志列表
- **GET** `/demo/tasklist/getRizhiList.action`
- 返回: `{ data: [], success: true }`

### 权限列表
- **GET** `/demo/account/authList.action?flash=true`
- 返回用户所有菜单权限

---

## 4. 状态/流程节点映射

| NEXTNODENAME | 含义 | 映射为本地状态 |
|-------------|------|--------------|
| (空/pending) | 待开发 | `pending` |
| 开发完成 | 开发已完成（待提交） | `in_progress` → `self_test` |
| 测试 | 测试中 | `testing` |
| 验收 | 验收中 | `verifying` |
| 结束X | 已结束/完成 | `completed` |

---

## 5. 关键发现

1. **登录流程**: 先 GET login.htm → POST loginForZdxm.action → 用返回的 JSESSIONID 做后续请求
2. **所有56条待办任务的 NEXTNODENAME 都是"开发完成"**，说明你的任务处于"开发完成等待下一步"的状态
3. **级别全是A或B**，优先级较高
4. **detail API**: `/demo/tasklist/getTasklistDetail.action` 返回404，详情页可能是通过 iframe 加载的 HTM 页面
5. **点击 #daiban_top 不会打开新窗口**，而是在当前页面通过 MiniUI window/iframe 展示
6. **任务列表页面**: `tasklist/tasklist.htm?type=rizhi` 或 `tasklist/index.htm?permId=130210`
