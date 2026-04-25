export const FB_PIXEL_EVENTS = [
  { value: 'ViewContent',          label: 'ViewContent (查看内容)' },
  { value: 'Search',               label: 'Search (搜索)' },
  { value: 'AddToCart',            label: 'AddToCart (加入购物车)' },
  { value: 'AddToWishlist',        label: 'AddToWishlist (加入愿望清单)' },
  { value: 'InitiateCheckout',     label: 'InitiateCheckout (发起结算)' },
  { value: 'AddPaymentInfo',       label: 'AddPaymentInfo (添加支付信息)' },
  { value: 'Purchase',             label: 'Purchase (购买)' },
  { value: 'Lead',                 label: 'Lead (线索)' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration (完成注册)' },
  { value: 'Contact',              label: 'Contact (联系)' },
  { value: 'CustomizeProduct',     label: 'CustomizeProduct (自定义产品)' },
  { value: 'Donate',               label: 'Donate (捐赠)' },
  { value: 'FindLocation',         label: 'FindLocation (查找位置)' },
  { value: 'Schedule',             label: 'Schedule (预约)' },
  { value: 'StartTrial',           label: 'StartTrial (开始试用)' },
  { value: 'SubmitApplication',    label: 'SubmitApplication (提交申请)' },
  { value: 'Subscribe',            label: 'Subscribe (订阅)' },
] as const

export const FB_DEFAULT_EVENT = 'Lead'

export type FbEventType = (typeof FB_PIXEL_EVENTS)[number]['value']

export const TIKTOK_PIXEL_EVENTS = [
  { value: 'AddPaymentInfo',       label: 'AddPaymentInfo (添加支付信息)' },
  { value: 'AddToCart',            label: 'AddToCart (加入购物车)' },
  { value: 'AddToWishlist',        label: 'AddToWishlist (加入愿望清单)' },
  { value: 'ApplicationApproval',  label: 'ApplicationApproval (申请通过)' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration (完成注册)' },
  { value: 'Contact',              label: 'Contact (联系)' },
  { value: 'CustomizeProduct',     label: 'CustomizeProduct (自定义产品)' },
  { value: 'Download',             label: 'Download (下载)' },
  { value: 'FindLocation',         label: 'FindLocation (查找位置)' },
  { value: 'InitiateCheckout',     label: 'InitiateCheckout (发起结算)' },
  { value: 'Purchase',             label: 'Purchase (购买)' },
  { value: 'Schedule',             label: 'Schedule (预约)' },
  { value: 'Search',               label: 'Search (搜索)' },
  { value: 'StartTrial',           label: 'StartTrial (开始试用)' },
  { value: 'SubmitApplication',    label: 'SubmitApplication (提交申请)' },
  { value: 'SubmitForm',           label: 'SubmitForm (提交表单)' },
  { value: 'Subscribe',            label: 'Subscribe (订阅)' },
] as const

export const TIKTOK_DEFAULT_EVENT = 'SubmitForm'

export type TikTokEventType = (typeof TIKTOK_PIXEL_EVENTS)[number]['value']
