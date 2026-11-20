/** Fictional demo identities used only in automated tests. Not real people or household data. */
export const DEMO = {
  alice: {
    id: '00000000-0000-4000-8000-0000000000a1',
    username: 'demo_alice',
    password: 'demo-pass-alice',
    display_name: '演示小艾',
  },
  bob: {
    id: '00000000-0000-4000-8000-0000000000b2',
    username: 'demo_bob',
    password: 'demo-pass-bob',
    display_name: '演示小贝',
  },
  cara: {
    id: '00000000-0000-4000-8000-0000000000c3',
    username: 'demo_cara',
    password: 'demo-pass-cara',
    display_name: '演示小卡',
  },
} as const

export const HOUSEHOLD_ACTIVE_ID = '00000000-0000-4000-8000-00000000aa01'
export const HOUSEHOLD_DISSOLVED_ID = '00000000-0000-4000-8000-00000000dd02'
export const CHORE_DISH_ID = '00000000-0000-4000-8000-00000000cc01'
export const TASK_PENDING_ID = '00000000-0000-4000-8000-00000000tt01'
