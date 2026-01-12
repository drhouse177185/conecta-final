'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  }
};
'use strict';

const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1️⃣ Busca todos os usuários com password NULL
    const [users] = await queryInterface.sequelize.query(`
      SELECT id FROM "users" WHERE "password" IS NULL;
    `);

    if (users.length > 0) {
      // 2️⃣ Gera um hash seguro para uma senha temporária
      const tempPassword = 'ChangeMe123!'; // senha temporária
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // 3️⃣ Atualiza todos os usuários com password NULL para o hash gerado
      await queryInterface.sequelize.query(`
        UPDATE "users"
        SET "password" = '${hashedPassword}'
        WHERE "password" IS NULL;
      `);

      console.log(`✅ ${users.length} usuários atualizados com senha temporária segura.`);
    }

    // 4️⃣ Altera a coluna para NOT NULL
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Reverte para permitir NULL novamente
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  }
};
