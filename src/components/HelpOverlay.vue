<script setup>
defineEmits(['close'])
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="panel">
      <h2 class="panel-title" style="font-size: 24px">生 存 指 南</h2>
      <div class="panel-sub">HOW TO SURVIVE IN THE RUST</div>

      <div class="help-grid">
        <b><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></b>
        <span>移动。轮式机体最快，履带最稳，四足跳得最高。</span>

        <b><kbd>空格</kbd> / <kbd>W</kbd></b>
        <span>跳跃（按住更高）；二段跳/悬停机体消耗能量；水中上浮。</span>

        <b><kbd>S</kbd> / <kbd>↓</kbd></b>
        <span>蹲伏（降低被发现概率）、下穿平台；在避难所按住 1.25 秒待机充电。</span>

        <b><kbd>J</kbd> / 鼠标左键</b>
        <span>使用当前工具：铲子挖土、镐破裂墙、焊枪修理、扫描仪标记埋藏物；也能打怪。</span>

        <b><kbd>1</kbd>-<kbd>4</kbd></b>
        <span>快速切换工具（铲 / 镐 / 焊枪 / 扫描仪）。</span>

        <b><kbd>E</kbd></b>
        <span>交互：拾取、开箱、撬牢笼、修理地标、与同伴对话。</span>

        <b><kbd>Q</kbd></b>
        <span>切换已解锁机体（消耗能量，有冷却）。</span>

        <b><kbd>I</kbd> <kbd>L</kbd> <kbd>C</kbd> <kbd>R</kbd></b>
        <span>背包 / 任务 / 档案 / 同伴面板。</span>

        <b><kbd>ESC</kbd></b>
        <span>暂停、设置、模组管理。</span>
      </div>

      <div class="help-grid" style="grid-template-columns: 1fr; color: var(--c-bone-dark)">
        <span>· 每个循环 300 秒。倒计时结束酸雨会腐蚀暴露在室外的机体，5 秒内报废。</span>
        <span>· 收集电量（电池、发电机）→ 攒够 3 格，回避难所待机，信号 +1。信号不足会掉。</span>
        <span>· 变异野兽与失控机器人都会掉零件；稀有组件可以装进六个槽位强化机体。</span>
        <span>· 营救任务：靠近牢笼按 E 撬开，把幸存者带回他们的避难所。</span>
        <span>· 遗物（日记 / 照片 / 书 / 首饰 / 衣物）会进入档案，凑齐能拼出旧世界的故事。</span>
        <span>· 支持 MOD：把内容包放进 public/mods/，在「模组管理」里开关，刷新后生效。</span>
      </div>

      <div class="btn-row">
        <button class="btn primary" @click="$emit('close')">明 白 了</button>
      </div>
    </div>
  </div>
</template>
