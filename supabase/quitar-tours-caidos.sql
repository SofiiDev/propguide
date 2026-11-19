-- Quita el link del tour 360° de las propiedades cuyo tour de Matterport ya no existe (error 404).
-- Revisado el 19/11/2026. Solo borra ese dato; el resto de la propiedad queda igual.
update public.propiedades
set data = data - 'tour360'
where data->>'tour360' ~ 'm=(WVzuXR8Vxfq|N5ReShXx8wS|XbDjmUhyHV7|VYnPwWb1xLi|CjRTkPCXSCF|3F7hmruoCGx|2nh7knsmcr2|PUGAjv4SUNo|XUBLLM2HsFs|4ToFBxpsLGh)'
returning codigo;
