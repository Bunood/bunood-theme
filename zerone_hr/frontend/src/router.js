import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Today', component: () => import('./pages/Today.vue') },
  { path: '/employees', name: 'Employees', component: () => import('./pages/Employees.vue') },
  { path: '/attendance', name: 'Attendance', component: () => import('./pages/Attendance.vue') },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('./pages/NotFound.vue') },
]

export default createRouter({ history: createWebHistory('/people'), routes })
