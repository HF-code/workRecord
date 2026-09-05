/**
 * 运维平台应用配置。
 * 默认数据来自 GET /deploy/application?group=JenkinsFrontweb 与 ?group=JenkinsPAAS
 * （2026-08-17 快照），按 app 去重（JenkinsFrontweb 优先）。
 * 运行时数据存 localStorage（work-tracker:devops-apps:v1），
 * 在「项目配置」页可一键同步覆盖/补充，也可手动增删与填写 gitUrl。
 */

export type DevopsGroup = 'JenkinsFrontweb' | 'JenkinsPAAS';

export interface DevopsApp {
  /** 项目名（唯一键，构建 payload 的 app 字段） */
  app: string;
  /** 中文别名 */
  alias: string;
  /** 运维平台分组 */
  group: DevopsGroup;
  /** Git 仓库地址，非必填，配置页手填 */
  gitUrl?: string;
}

export const DEVOPS_GROUPS: DevopsGroup[] = ['JenkinsFrontweb', 'JenkinsPAAS'];

export const DEFAULT_DEVOPS_APPS: DevopsApp[] = [
  { app: 'agentadmin', alias: 'agent控制台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/agentadmin' },
  { app: 'audit-view', alias: '视频审核页', group: 'JenkinsFrontweb' },
  { app: 'audit-web', alias: '总后台审核服务', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/vzan-technical-middle/audit-web' },
  { app: 'classPC', alias: 'PC客户端白板 嵌套的网页部分', group: 'JenkinsFrontweb' },
  { app: 'cloudvideocut', alias: '云剪辑', group: 'JenkinsFrontweb' },
  { app: 'cloudy', alias: '融合云-前端', group: 'JenkinsFrontweb' },
  { app: 'cloud_desktop', alias: '云桌面', group: 'JenkinsFrontweb' },
  { app: 'control_web', alias: '芯象控制中心', group: 'JenkinsFrontweb' },
  { app: 'customerservice', alias: '客服系统', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/CustomerServiceSystem' },
  { app: 'data_admin', alias: '教培业务数据平台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/data_admin' },
  { app: 'education', alias: '教培三分屏', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/education/education' },
  { app: 'execution_mobile_com', alias: '约立拍移动官网', group: 'JenkinsFrontweb' },
  { app: 'execution_pc_com', alias: '约立拍pc官网', group: 'JenkinsFrontweb' },
  { app: 'GroupChat', alias: '星享App内嵌群聊', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/GroupChat.git' },
  { app: 'guide_live', alias: '导购直播', group: 'JenkinsFrontweb' },
  { app: 'guide_pages', alias: 'guide_pages', group: 'JenkinsFrontweb' },
  { app: 'im_system', alias: '群聊助手', group: 'JenkinsFrontweb' },
  { app: 'knowledgelive', alias: '知播PC后台', group: 'JenkinsFrontweb' },
  { app: 'knowledgelive_pc', alias: '知播客户端内嵌网页', group: 'JenkinsFrontweb' },
  { app: 'knowledgelive_web', alias: 'knowledgelive_web', group: 'JenkinsFrontweb' },
  { app: 'knowledge_com', alias: '知播官网', group: 'JenkinsFrontweb' },
  { app: 'kuta_admin', alias: '酷塔pc后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/kuta_admin' },
  { app: 'kuta_anti_cheat', alias: '酷塔风控系统', group: 'JenkinsFrontweb' },
  { app: 'kuta_app', alias: '酷塔小程序', group: 'JenkinsFrontweb' },
  { app: 'kuta_com', alias: '酷塔官网', group: 'JenkinsFrontweb' },
  { app: 'kuta_mobile', alias: '酷塔h5端', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/kuta_mobile' },
  { app: 'live-h5-2', alias: 'live-h5前后端', group: 'JenkinsFrontweb' },
  { app: 'live-logreport', alias: '日志上报', group: 'JenkinsFrontweb' },
  { app: 'live-user', alias: '直播用户后台', group: 'JenkinsFrontweb' },
  { app: 'livepage', alias: 'livepage', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/livepage' },
  { app: 'live_execution_admin', alias: 'live_execution_admin', group: 'JenkinsFrontweb' },
  { app: 'live_vzan_com', alias: '微赞官网', group: 'JenkinsFrontweb' },
  { app: 'material_center', alias: '素材中心', group: 'JenkinsFrontweb' },
  { app: 'oper_vzan_os', alias: '淘乐播运营后台', group: 'JenkinsFrontweb' },
  { app: 'paasadmin', alias: 'paas 服务管理后台', group: 'JenkinsFrontweb' },
  { app: 'paas_com', alias: 'paas 官网', group: 'JenkinsFrontweb' },
  { app: 'plug-ins', alias: 'plug-ins', group: 'JenkinsFrontweb' },
  { app: 'private-customer-web', alias: 'private-customer-web', group: 'JenkinsFrontweb' },
  { app: 'review_admin', alias: '公共投诉平台', group: 'JenkinsFrontweb' },
  { app: 'sc-vzan-com', alias: '微赞竞价官网', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/official_pages/sc.vzan.com' },
  { app: 'select_admin', alias: '选品平台PC版', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/select_admin' },
  { app: 'select_chain', alias: '微赞云选-存瑰宝', group: 'JenkinsFrontweb' },
  { app: 'select_com', alias: '选品官网', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/select_com' },
  { app: 'select_mobile', alias: '选品平台H5版', group: 'JenkinsFrontweb' },
  { app: 'sell_vzan_os', alias: 'sell_vzan_os', group: 'JenkinsFrontweb' },
  { app: 'send_admin', alias: '超级群发后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/send_admin' },
  { app: 'shop_admin', alias: '聚店通管理后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/shop_admin' },
  { app: 'showroomadmin', alias: '微赞3D展厅管理后台', group: 'JenkinsFrontweb' },
  { app: 'showroom_3d', alias: '微赞3D展厅', group: 'JenkinsFrontweb' },
  { app: 'sinsam_com', alias: '芯象官网', group: 'JenkinsFrontweb' },
  { app: 'smsadmin', alias: '短信平台管理后台', group: 'JenkinsFrontweb' },
  { app: 'star_com', alias: '星享官网', group: 'JenkinsFrontweb' },
  { app: 'store_admin', alias: 'PC版店长后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/store_admin.git' },
  { app: 'store_mobile', alias: '大健康-门店管理平台H5端', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/store_mobile' },
  { app: 'supply_admin', alias: '供应商后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/supply_admin' },
  { app: 'supply_chain_oper', alias: '淘乐播-供应链系统运营后台', group: 'JenkinsFrontweb' },
  { app: 'supply_chain_admin', alias: '供应链后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/SupplyChainSystem/supply_chain_admin' },
  { app: 'taolebo-global-h5', alias: '淘乐播海外版', group: 'JenkinsFrontweb' },
  { app: 'taolebo_com', alias: '淘乐播官网', group: 'JenkinsFrontweb' },
  { app: 'userlive', alias: '直播B端管理后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/live/userlive' },
  { app: 'vzan-ac-web', alias: '反作弊管理后台', group: 'JenkinsFrontweb' },
  { app: 'vzan-account-web', alias: 'vzan-account-web', group: 'JenkinsFrontweb' },
  { app: 'vzan-cms-web', alias: 'vzan-cms-web', group: 'JenkinsFrontweb' },
  { app: 'vzan-pic-live', alias: 'PC图片直播', group: 'JenkinsFrontweb' },
  { app: 'vzanlivemobile', alias: '新微信端h5', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/front-end/live/vzanlivemobile' },
  { app: 'vzanlivepc', alias: 'vzanlivepc', group: 'JenkinsFrontweb' },
  { app: 'vzanlive_weapp', alias: '微赞直播小程序', group: 'JenkinsFrontweb' },
  { app: 'weistream_admin_web', alias: '海外直播开放平台-管理后台', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/weistream/weistream_admin' },
  { app: 'weistream_com', alias: '海外直播开放平台-官网', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/weistream/weistream_com' },
  { app: 'weistream_web', alias: '海外直播开放平台-流分发前端', group: 'JenkinsFrontweb', gitUrl: 'https://gitlab.vzan.com/weistream/weistream_web' },
  { app: 'yingxiao-pc', alias: '营销-前端PC端后台', group: 'JenkinsFrontweb' },
  { app: 'yingxiao-wx-front', alias: '营销-前端wx', group: 'JenkinsFrontweb' },
  { app: 'yx-web', alias: '优想-前端Wx前台', group: 'JenkinsFrontweb' },
  { app: 'yx-web-admin', alias: '优想-前端PC端Admin后台', group: 'JenkinsFrontweb' },
  { app: 'yx-web-static', alias: '优想-前端Wx前台', group: 'JenkinsFrontweb' },
  { app: 'zhibo-web-mobile', alias: '知播移动Web端', group: 'JenkinsFrontweb' },
  { app: 'zhibo-web-pc', alias: '知播管理后台', group: 'JenkinsFrontweb' },
  { app: 'saas-scrm-admin-web', alias: 'saas-scrm-前端PC后台', group: 'JenkinsPAAS', gitUrl: 'https://gitlab.vzan.com/saas-scrm/admin-web' },
  { app: 'saas-scrm-app-web', alias: 'saas-scrm-前端小程序', group: 'JenkinsPAAS' },
  { app: 'saas-scrm-cwx-web', alias: 'saas-scrm-前端企业微信', group: 'JenkinsPAAS', gitUrl: 'https://gitlab.vzan.com/saas-scrm/cwx-web' },
  { app: 'saas-scrm-index-web', alias: 'saas-scrm-官网', group: 'JenkinsPAAS' },
  { app: 'scrm_admin_operation', alias: 'scrm运营管理后台', group: 'JenkinsPAAS' },
];
