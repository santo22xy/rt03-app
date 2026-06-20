// Test getNextSaturdays
import { getNextSaturdays } from '../src/lib/ronda.ts'
const fromDate = new Date('2026-06-19T10:00:00')
console.log('Today:', fromDate.toDateString(), fromDate.toLocaleString('id-ID', { weekday: 'long' }))
console.log('Next Saturdays:')
console.log(getNextSaturdays(6, fromDate).map(s => `  ${s.value} -> ${s.label}`).join('\n'))