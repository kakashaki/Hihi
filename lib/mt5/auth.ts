import { BROKER_SERVERS, getBrokerServer } from './marketData';
import type { AccountType, Mt5Account } from './types';

export interface LoginAttemptInput {
  login: string;
  password: string;
  serverId: string;
  savePassword: boolean;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  account?: Mt5Account;
  accounts?: Mt5Account[];
}

export interface RegisterAccountInput {
  holderName: string;
  serverId: string;
  accountType: AccountType;
  initialDeposit: number;
  leverage: number;
  password: string;
}

export function authenticateMt5Account(
  existingAccounts: Mt5Account[],
  input: LoginAttemptInput
): LoginResult {
  const login = input.login.trim();
  const password = input.password;
  const server = BROKER_SERVERS.find(
    (s) => s.id === input.serverId || s.name === input.serverId
  );

  if (!login || login.length < 4 || !/^[a-zA-Z0-9_-]+$/.test(login)) {
    return {
      ok: false,
      error: 'Số tài khoản (Login) phải có ít nhất 4 ký tự hợp lệ.',
    };
  }

  if (!password || password.length < 4) {
    return {
      ok: false,
      error: 'Vui lòng nhập mật khẩu giao dịch (tối thiểu 4 ký tự).',
    };
  }

  if (!server) {
    return {
      ok: false,
      error: 'Máy chủ giao dịch không hợp lệ hoặc không thể kết nối.',
    };
  }

  const matchIndex = existingAccounts.findIndex(
    (acc) => acc.login === login && acc.serverId === server.id
  );

  if (matchIndex !== -1) {
    const matched = existingAccounts[matchIndex];
    if (matched.password !== password) {
      return {
        ok: false,
        error: `Ủy quyền thất bại cho tài khoản ${login} trên ${server.name}: Sai mật khẩu.`,
      };
    }

    const updatedAccount: Mt5Account = {
      ...matched,
      savePassword: input.savePassword,
    };
    const nextAccounts = [...existingAccounts];
    nextAccounts[matchIndex] = updatedAccount;
    return {
      ok: true,
      account: updatedAccount,
      accounts: nextAccounts,
    };
  }

  // New user-supplied account login on chosen broker server
  const newAccount: Mt5Account = {
    login,
    password,
    holderName:
      server.accountType === 'real' ? `Trader Real #${login}` : `Demo Trader #${login}`,
    serverId: server.id,
    serverName: server.name,
    company: server.company,
    accountType: server.accountType,
    currency: 'USD',
    balance: server.accountType === 'real' ? 5000.0 : 10000.0,
    leverage: 500,
    savePassword: input.savePassword,
  };

  return {
    ok: true,
    account: newAccount,
    accounts: [newAccount, ...existingAccounts],
  };
}

export function createNewMt5Account(
  existingAccounts: Mt5Account[],
  input: RegisterAccountInput
): LoginResult {
  const holderName = input.holderName.trim();
  const password = input.password;
  const server = getBrokerServer(input.serverId);

  if (!holderName || holderName.length < 2) {
    return {
      ok: false,
      error: 'Vui lòng nhập họ tên chủ tài khoản.',
    };
  }

  if (!password || password.length < 4) {
    return {
      ok: false,
      error: 'Mật khẩu phải có ít nhất 4 ký tự.',
    };
  }

  if (!Number.isFinite(input.initialDeposit) || input.initialDeposit < 100) {
    return {
      ok: false,
      error: 'Số dư ban đầu tối thiểu là $100.',
    };
  }

  // Filter server matching requested type if needed
  const targetServer =
    server.accountType === input.accountType
      ? server
      : BROKER_SERVERS.find((s) => s.accountType === input.accountType) ?? server;

  const prefix = input.accountType === 'real' ? '88' : '50';
  let candidateLogin = '';
  for (let i = 0; i < 20; i += 1) {
    const suffix = String(Math.floor(100000 + Math.random() * 899999));
    candidateLogin = `${prefix}${suffix}`;
    if (!existingAccounts.some((a) => a.login === candidateLogin)) break;
  }

  const created: Mt5Account = {
    login: candidateLogin,
    password,
    holderName,
    serverId: targetServer.id,
    serverName: targetServer.name,
    company: targetServer.company,
    accountType: input.accountType,
    currency: 'USD',
    balance: Number(input.initialDeposit.toFixed(2)),
    leverage: input.leverage,
    savePassword: true,
  };

  return {
    ok: true,
    account: created,
    accounts: [created, ...existingAccounts],
  };
}

export function resetDemoAccountBalance(
  account: Mt5Account,
  newBalance: number
): { ok: boolean; error?: string; account?: Mt5Account } {
  if (account.accountType !== 'demo') {
    return {
      ok: false,
      error: 'Không thể nạp tiền ảo trên tài khoản Real.',
    };
  }
  if (!Number.isFinite(newBalance) || newBalance < 100 || newBalance > 10000000) {
    return {
      ok: false,
      error: 'Số tiền nạp Demo hợp lệ từ $100 đến $10,000,000.',
    };
  }
  return {
    ok: true,
    account: {
      ...account,
      balance: Number(newBalance.toFixed(2)),
    },
  };
}
