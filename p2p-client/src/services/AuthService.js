import { buildApiUrl } from './ConfigService';
const USER_INFO_KEY = 'p2p_user_info';

class AuthService {
  getCurrentUser() {
    const userInfoStr = localStorage.getItem(USER_INFO_KEY);
    if (userInfoStr) {
      try {
        return JSON.parse(userInfoStr);
      } catch (error) {
        console.error('Error parsing user info:', error);
        return null;
      }
    }
    return null;
  }

  setCurrentUser(userInfo) {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
  }

  logout() {
    localStorage.removeItem(USER_INFO_KEY);
  }

  async generateInvitationCode() {
    console.log('Generating invitation code...');
    try {
      const apiUrl = buildApiUrl('invitation/generate');
      console.log(`Using API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        mode: 'cors'
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to generate invitation code: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      // 保存生成的邀请码到localStorage，使其在重定向后仍然可用
      localStorage.setItem('p2p_last_invitation_code', data.invitationCode);
      console.log('Response data:', data);
      return data;
    } catch (error) {
      console.error('Error generating code:', error);
      throw error;
    }
  }

  async authenticateWithCode(invitationCode) {
    // 先规范化邀请码，去除空白字符
    const normalizedCode = invitationCode.trim();
    console.log('Authenticating with code:', normalizedCode);
    
    try {
      const apiUrl = buildApiUrl('invitation/authenticate');
      console.log(`Using API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        mode: 'cors',
        body: JSON.stringify({ invitationCode: normalizedCode })
      });

      console.log('Auth response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Auth error response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || 'Authentication failed');
        } catch (e) {
          throw new Error(`Authentication failed: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();
      console.log('Auth response data:', data);
      return data;
    } catch (error) {
      console.error('Error authenticating:', error);
      throw error;
    }
  }
}

// 创建实例并导出，避免匿名默认导出
const authService = new AuthService();
export default authService;