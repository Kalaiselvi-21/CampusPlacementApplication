const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend', 'routes', 'auth.js');
let lines = fs.readFileSync(file, 'utf8').split('\n');

console.log('Fixing brace structure...\n');

// Fix lines 347-350 (0-indexed: 346-349)
// Current:
//   break;
//   }
//   }
//       } catch (error) {

// Should be:
//   break;
//               }
//             }
//           }
//         }
//       } catch (error) {

// Find the line with "break;" around line 347
for (let i = 340; i < 350; i++) {
  if (lines[i].includes('break;')) {
    console.log(`Found 'break;' at line ${i + 1}`);
    // Replace the next 3 lines
    lines[i + 1] = '              }';
    lines[i + 2] = '            }';
    lines[i + 3] = '          }';
    lines[i + 4] = '        }';
    lines[i + 5] = '      } catch (error) {';
    lines[i + 6] = '        console.error("Error in auto CGPA assignment:", error);';
    lines[i + 7] = '      }';
    lines[i + 8] = '    }';
    console.log('✅ Fixed brace structure');
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('\n✅ File saved!');
