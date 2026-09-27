App({
  onLaunch() {
    if (wx.cloud) wx.cloud.init({ env: 'cloud1-d5gm91jvi866ad2d2', traceUser: true })
  },

  globalData: {
    subscribeTemplateId: 'AB6fGxSbBCfB9xNYJzZKnk5FThAFspuu9JACGrU4NF0'
  }
})
