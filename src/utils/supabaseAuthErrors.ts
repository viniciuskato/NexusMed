/**
 * Utilitário de Tradução de Erros do Supabase Authentication para Português
 */

export function getSupabaseAuthErrorMessage(error: unknown): string {
  if (!error) return 'Ocorreu um erro desconhecido.';

  const fields = (typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown };
  const code = typeof error === 'string' ? error : fields.code || '';

  switch (code) {
    case 'email_exists':
    case 'user_already_exists':
      return 'Este endereço de e-mail já está cadastrado no NexusMed. Faça login com sua senha ou utilize a recuperação de senha.';
    case 'validation_failed':
    case 'bad_json':
    case 'email_address_invalid':
      return 'O formato do e-mail informado é inválido. Verifique se digitou corretamente (ex: estudante@faculdade.edu.br).';
    case 'user_not_found':
      return 'Não encontramos nenhuma conta cadastrada com este endereço de e-mail. Verifique a digitação ou crie uma nova conta.';
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos. Por favor, confira suas credenciais de acesso.';
    case 'weak_password':
      return 'A senha é muito fraca. Escolha uma senha com no mínimo 6 caracteres, preferencialmente combinando letras e números.';
    case 'email_not_confirmed':
      return 'Sua conta já foi criada, mas o e-mail ainda não foi confirmado. Verifique sua caixa de entrada (e o spam) e clique no link de confirmação antes de entrar.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'Acesso temporariamente bloqueado devido a muitas tentativas sem sucesso. Por segurança, aguarde alguns instantes antes de tentar novamente.';
    case 'user_banned':
      return 'Esta conta de usuário foi desativada pelo administrador. Entre em contato com o suporte acadêmico.';
    case 'provider_email_needs_verification':
      return 'Sua conta do Google usa um e-mail que ainda precisa ser verificado antes de ser vinculado ao NexusMed. Verifique o e-mail associado à sua conta Google e tente novamente.';
    case 'oauth_provider_not_supported':
      return 'O login com Google não está habilitado no momento. Entre em contato com o suporte acadêmico ou utilize e-mail e senha.';
    case 'bad_oauth_state':
    case 'bad_oauth_callback':
      return 'Não foi possível concluir o login com o Google porque o retorno de autenticação é inválido ou expirou. Tente fazer login novamente.';
    case 'signup_disabled':
      return 'O cadastro de novas contas está temporariamente desativado. Entre em contato com o suporte acadêmico.';
    case 'same_password':
      return 'A nova senha deve ser diferente da senha atual.';
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return 'Sua sessão expirou. Por favor, encerre a sessão e entre novamente.';
    case 'request_timeout':
      return 'Falha de conexão com os servidores de autenticação. Verifique sua conexão com a internet e tente novamente.';
    default: {
      const msg = fields.message;
      if (typeof msg === 'string' && msg.trim().length > 0) {
        return msg;
      }
      return 'Ocorreu um erro ao processar sua autenticação. Por favor, tente novamente.';
    }
  }
}
