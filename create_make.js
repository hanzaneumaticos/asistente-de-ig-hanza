const axios = require('axios');
const fs = require('fs');

async function createScenario() {
    try {
        const response = await axios.post('https://us2.make.com/api/v2/scenarios', {
            name: "Hanza AI Bridge",
            teamId: 2227433
        }, {
            headers: {
                'Authorization': 'Token 58eb92aa-b175-4c89-9e1e-a3b9b9b01b0c',
                'Content-Type': 'application/json'
            }
        });
        console.log('Scenario Created:', response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

createScenario();
